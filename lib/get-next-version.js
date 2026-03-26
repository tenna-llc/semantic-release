const semver = require('semver');
const {FIRST_RELEASE, FIRSTPRERELEASE} = require('./definitions/constants');
const {isSameChannel} = require('./utils');

module.exports = ({branch, nextRelease: {channel}, lastRelease, logger}) => {
  const prereleaseId = branch.prerelease || 'build';
  let version;

  if (lastRelease.version) {
    const {major, minor, patch} = semver.parse(lastRelease.version);

    if (
      semver.prerelease(lastRelease.version) &&
      lastRelease.channels.some((lastReleaseChannel) => isSameChannel(lastReleaseChannel, channel))
    ) {
      // Always only increment the build number — never touch major/minor/patch
      version = semver.inc(lastRelease.version, 'prerelease');
    } else {
      // First release on this channel: preserve existing major.minor.patch, start build at 1.
      // But first check for live (non-consumed) prerelease tags on this base version — a tag is
      // "consumed" (merged to another channel) when its channels array contains a channel that
      // differs from the current one.
      const baseVersion = `${major}.${minor}.${patch}`;
      const existingPrerelease = branch.tags
        .filter((tag) => {
          const pre = semver.prerelease(tag.version);
          return (
            pre &&
            pre[0] === prereleaseId &&
            semver.coerce(tag.version).version === baseVersion &&
            tag.channels.every((ch) => isSameChannel(ch, channel))
          );
        })
        .sort((a, b) => semver.rcompare(a.version, b.version))[0];

      if (existingPrerelease) {
        version = semver.inc(existingPrerelease.version, 'prerelease');
      } else {
        version = `${major}.${minor}.${patch}-${prereleaseId}.${FIRSTPRERELEASE}`;
      }
    }

    logger.log('The next release version is %s', version);
  } else {
    version = `${FIRST_RELEASE}-${prereleaseId}.${FIRSTPRERELEASE}`;
    logger.log(`There is no previous release, the next release version is ${version}`);
  }

  return version;
};
