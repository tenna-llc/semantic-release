const test = require('ava');
const fs = require('fs');
const path = require('path');
const tempy = require('tempy');
const getNextVersion = require('../lib/get-next-version');

function next(version, options = {buildVersionSource: 'package'}, prerelease = 'build') {
  const cwd = tempy.directory();
  try {
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({version}));
    return getNextVersion({
      cwd,
      options,
      branch: {prerelease, tags: []},
      nextRelease: {channel: null},
      lastRelease: {version: '3.1.0-build.2', channels: [null]},
      logger: {log() {}},
    });
  } finally {
    fs.rmSync(cwd, {recursive: true, force: true});
  }
}

test('package allocation preserves the base and advances beyond reachable tags', (t) => {
  t.is(next('3.1.0-build.26'), '3.1.0-build.27');
  t.is(next('4.6.9-build.0'), '4.6.9-build.1');
  t.is(next('3.1.0-build.26', {}), '3.1.0-build.3');
});

test('package allocation rejects invalid versions and unsafe counters', (t) => {
  for (const version of [
    undefined,
    '3.1.0',
    'v3.1.0-build.2',
    '03.1.0-build.2',
    '3.1.0-build.02',
    '3.1.0-beta.2',
    '3.1.0-build.2\n',
    '3.1.0-build.9007199254740991',
    '9007199254740992.0.0-build.0',
  ]) {
    t.throws(() => next(version), {message: /canonical/});
  }

  t.throws(() => next('3.1.0-build.2', undefined, 'beta'), {message: /canonical/});
});
