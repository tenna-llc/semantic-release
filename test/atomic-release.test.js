const test = require('ava');
const execa = require('execa');
const {gitRepo, gitCommits, gitPush} = require('./helpers/git-utils');
const {addNote, pushAtomic} = require('../lib/git');

async function remoteRefs(repositoryUrl, cwd) {
  return (await execa('git', ['ls-remote', '--heads', '--tags', repositoryUrl], {cwd})).stdout;
}

test('atomic release publishes branch, tag and notes together', async (t) => {
  const {cwd, repositoryUrl} = await gitRepo(true);
  const [first] = await gitCommits(['First'], {cwd});
  await gitPush(repositoryUrl, 'master', {cwd});
  const [second] = await gitCommits(['Second'], {cwd});
  await execa('git', ['tag', 'v1.0.1'], {cwd});
  await addNote({channels: [null]}, second.hash, {cwd});
  await pushAtomic(repositoryUrl, 'master', 'v1.0.1', first.hash, {cwd});
  const refs = await remoteRefs(repositoryUrl, cwd);
  t.true(refs.includes(`refs/heads/master`));
  t.true(refs.includes(`refs/tags/v1.0.1`));
  const notes = (await execa('git', ['ls-remote', repositoryUrl, 'refs/notes/semantic-release'], {cwd})).stdout;
  t.true(notes.includes('refs/notes/semantic-release'));
});

test('existing tag rejects the entire atomic release', async (t) => {
  const {cwd, repositoryUrl} = await gitRepo(true);
  const [first] = await gitCommits(['First'], {cwd});
  await gitPush(repositoryUrl, 'master', {cwd});
  await execa('git', ['tag', 'v1.0.1'], {cwd});
  await execa('git', ['push', repositoryUrl, 'refs/tags/v1.0.1'], {cwd});
  const before = await remoteRefs(repositoryUrl, cwd);
  const [second] = await gitCommits(['Second'], {cwd});
  await addNote({channels: [null]}, second.hash, {cwd});
  await t.throwsAsync(pushAtomic(repositoryUrl, 'master', 'v1.0.1', first.hash, {cwd}), {message: /already exists/});
  t.is(await remoteRefs(repositoryUrl, cwd), before);
});
