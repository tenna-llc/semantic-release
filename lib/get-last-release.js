const {isUndefined} = require('lodash');
const semver = require('semver');
const {makeTag, isSameChannel} = require('./utils');

/**
 * Last release.
 *
 * @typedef {Object} LastRelease
 * @property {string} version The version number of the last release.
 * @property {string} gitHead The Git reference used to make the last release.
 * @property {string} gitTag The git tag associated with the last release.
 * @property {string} channel The channel on which of the last release was published.
 * @property {string} name The name of the last release.
 */

/**
 * Determine the Git tag and version of the last tagged release.
 *
 * - Filter out the branch tags that are not valid semantic version
 * - Sort the versions
 * - Retrive the highest version
 *
 * @param {Object} context semantic-release context.
 * @param {Object} params Function parameters.
 * @param {Object} params.before Find only releases with version number lower than this version.
 *
 * @return {LastRelease} The last tagged release or empty object if none is found.
 */
module.exports = ({branch, options: {tagFormat}}, {before} = {}) => {
  // For release branches, build-number prerelease tags (e.g. 1.0.0-build.N) represent actual
  // releases. Use the branch's prerelease identifier (defaulting to 'build') to recognise them.
  const prereleaseId = branch.prerelease || 'build';

  const [{version, gitTag, channels} = {}] = branch.tags
    .filter(
      (tag) =>
        ((branch.type === 'prerelease' &&
          tag.channels &&
          tag.channels.some((channel) => isSameChannel(branch.channel, channel))) ||
          !semver.prerelease(tag.version) ||
          // For release branches, also consider build-number prerelease tags on the same channel
          (branch.type !== 'prerelease' &&
            (semver.prerelease(tag.version) || [])[0] === prereleaseId &&
            tag.channels &&
            tag.channels.some((ch) => isSameChannel(branch.channel, ch)))) &&
        (isUndefined(before) || semver.lt(tag.version, before))
    )
    .sort((a, b) => {
      // For release branches: among tags with the same major.minor.patch, treat build-number
      // prerelease tags as newer than the stable version (they represent the most recent release).
      if (branch.type !== 'prerelease') {
        const aBase = semver.coerce(a.version).version;
        const bBase = semver.coerce(b.version).version;
        if (aBase === bBase) {
          const aPre = semver.prerelease(a.version);
          const bPre = semver.prerelease(b.version);
          const aIsBuild = aPre && aPre[0] === prereleaseId;
          const bIsBuild = bPre && bPre[0] === prereleaseId;
          if (aIsBuild && !bIsBuild) return -1;
          if (bIsBuild && !aIsBuild) return 1;
        }
      }

      return semver.rcompare(a.version, b.version);
    });

  if (gitTag) {
    return {version, gitTag, channels, gitHead: gitTag, name: makeTag(tagFormat, version)};
  }

  return {};
};
