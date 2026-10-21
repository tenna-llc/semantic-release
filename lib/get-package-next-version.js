const fs = require('fs');
const path = require('path');

module.exports = (cwd, prereleaseId) => {
  const {version} = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-build\.(0|[1-9]\d*)$/.exec(version);
  if (
    prereleaseId !== 'build' ||
    !match ||
    match[0] !== version ||
    match.slice(1).some((part) => !Number.isSafeInteger(Number(part))) ||
    Number(match[4]) === Number.MAX_SAFE_INTEGER
  ) {
    throw new Error(
      'Package-based build allocation requires a canonical MAJOR.MINOR.PATCH-build.N version with safe counters'
    );
  }

  return `${match[1]}.${match[2]}.${match[3]}-build.${Number(match[4]) + 1}`;
};
