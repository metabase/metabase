const semver = require("semver");

const { dependencies } = require("../../../../package.json");

// The SDK bundle needs at least the React major that Metabase itself is built with.
// A string, since it is passed on as an environment variable.
module.exports.EMBEDDING_SDK_MINIMUM_REACT_MAJOR_VERSION = String(
  semver.minVersion(dependencies.react).major,
);
