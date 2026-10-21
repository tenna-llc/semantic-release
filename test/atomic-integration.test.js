const test = require('ava');
const fs = require('fs');
const path = require('path');
const tempy = require('tempy');
const execa = require('execa');
const release = require('..');

async function fixture(failingPrepare = false, version = '1.0.0-build.0') {
  const root = tempy.directory();
  const bare = path.join(root, 'remote.git');
  const cwd = path.join(root, 'work');
  await execa('git', ['init', '--bare', bare]);
  await execa('git', ['symbolic-ref', 'HEAD', 'refs/heads/main'], {cwd: bare});
  await execa('git', ['init', '-b', 'main', cwd]);
  const git = (...args) => execa('git', args, {cwd});
  await git('config', 'user.name', 'Fixture');
  await git('config', 'user.email', 'fixture@example.com');
  await git('remote', 'add', 'origin', bare);
  fs.mkdirSync(path.join(cwd, '.github/workflows/scripts'), {recursive: true});
  fs.writeFileSync(
    path.join(cwd, '.github/workflows/scripts/atomic-prep.js'),
    failingPrepare
      ? `exports.prepare = () => { throw new Error('fixture preparation failure'); };`
      : `const cp = require('child_process'); exports.prepare = () => { cp.execFileSync('git', ['add', 'package.json', 'package-lock.json']); cp.execFileSync('git', ['commit', '-m', 'chore(release): prepared']); };`
  );
  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({name: 'atomic-fixture', version}));
  fs.writeFileSync(
    path.join(cwd, 'package-lock.json'),
    JSON.stringify({name: 'atomic-fixture', version, packages: {'': {version}}})
  );
  fs.writeFileSync(
    path.join(cwd, '.releaserc.json'),
    JSON.stringify({
      branches: [{name: 'main', channel: false, prerelease: 'build'}],
      atomicRelease: true,
      repositoryUrl: `file://${bare}`,
      plugins: [
        '@semantic-release/commit-analyzer',
        '@semantic-release/release-notes-generator',
        ['@semantic-release/npm', {npmPublish: false}],
        './.github/workflows/scripts/atomic-prep.js',
      ],
    })
  );
  await git('add', '.');
  await git('commit', '-m', 'chore: initial');
  await git('tag', `v${version}`);
  await git('push', 'origin', 'main', `refs/tags/v${version}`);
  await git('commit', '--allow-empty', '-m', 'feat: change');
  await git('push', 'origin', 'main');
  const before = (await execa('git', ['ls-remote', '--heads', '--tags', bare], {cwd})).stdout;
  return {cwd, bare, before};
}

async function run(cwd) {
  const head = (await execa('git', ['rev-parse', 'HEAD'], {cwd})).stdout;
  const original = process.cwd();
  process.chdir(cwd);
  try {
    return await release(
      {noCi: true, dryRun: false},
      {
        cwd,
        env: {
          ...process.env,
          CI: 'true',
          GITHUB_ACTIONS: 'true',
          GITHUB_REF: 'refs/heads/main',
          GITHUB_REPOSITORY: 'tenna-llc/fe-parts',
          GITHUB_SHA: head,
        },
      }
    );
  } finally {
    process.chdir(original);
  }
}

test.serial('opted-in release publishes the prepared commit and tag together', async (t) => {
  const {cwd, bare} = await fixture();
  const result = await run(cwd);
  t.is(result.nextRelease.version, '1.0.0-build.1');
  const refs = (await execa('git', ['ls-remote', '--heads', '--tags', bare], {cwd})).stdout;
  const branch = refs.match(/^([a-f\d]+)\trefs\/heads\/main/m)[1];
  const tag = refs.match(/^([a-f\d]+)\trefs\/tags\/v1\.0\.0-build\.1/m)[1];
  t.is(branch, tag);
  const notes = (await execa('git', ['ls-remote', bare, 'refs/notes/semantic-release'], {cwd})).stdout;
  t.true(notes.includes('refs/notes/semantic-release'));
});

test.serial('failed preparation leaves all remote refs unchanged', async (t) => {
  const {cwd, bare, before} = await fixture(true);
  await t.throwsAsync(run(cwd), {message: /fixture preparation failure/});
  const after = (await execa('git', ['ls-remote', '--heads', '--tags', bare], {cwd})).stdout;
  t.is(after, before);
});

async function divergentFixture(collision = false) {
  const {cwd, bare} = await fixture(false, '3.1.0-build.2');
  const git = (...args) => execa('git', args, {cwd});
  const configPath = path.join(cwd, '.releaserc.json');
  const config = JSON.parse(fs.readFileSync(configPath));
  config.buildVersionSource = 'package';
  fs.writeFileSync(configPath, JSON.stringify(config));
  for (const file of ['package.json', 'package-lock.json']) {
    const filename = path.join(cwd, file);
    const metadata = JSON.parse(fs.readFileSync(filename));
    metadata.version = '3.1.0-build.26';
    if (metadata.packages) metadata.packages[''].version = metadata.version;
    fs.writeFileSync(filename, JSON.stringify(metadata));
  }

  await git('switch', '-c', 'original-history');
  await git('add', '.');
  await git('commit', '-m', 'chore(release): original build 26');
  await git('tag', 'v3.1.0-build.26');
  await git('push', 'origin', 'refs/tags/v3.1.0-build.26');
  if (collision) {
    await git('tag', 'v3.1.0-build.27');
    await git('push', 'origin', 'refs/tags/v3.1.0-build.27');
  }

  await git('switch', 'main');
  await git('checkout', 'original-history', '--', '.');
  await git('commit', '-m', 'fix: cherry-picked release metadata');
  await git('push', 'origin', 'main');
  return {cwd, bare, before: (await git('ls-remote', '--refs', bare)).stdout};
}

test.serial('package allocation publishes beyond a tag on divergent history', async (t) => {
  const {cwd, bare} = await divergentFixture();
  const result = await run(cwd);
  t.is(result.lastRelease.version, '3.1.0-build.2');
  t.is(result.nextRelease.version, '3.1.0-build.27');
  const head = (await execa('git', ['rev-parse', 'HEAD'], {cwd})).stdout;
  const refs = (await execa('git', ['ls-remote', '--refs', bare], {cwd})).stdout;
  t.true(refs.includes(`${head}\trefs/heads/main`));
  t.true(refs.includes(`${head}\trefs/tags/v3.1.0-build.27`));
});

test.serial('package allocation rejects collisions without publishing', async (t) => {
  const {cwd, bare, before} = await divergentFixture(true);
  await t.throwsAsync(run(cwd), {message: /Release tag already exists/});
  t.is((await execa('git', ['ls-remote', '--refs', bare], {cwd})).stdout, before);
});
