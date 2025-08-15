module.exports.INJECTED_BUILD_INFO_VALUES = {
  GIT_BRANCH: require("child_process")
    .execSync("git rev-parse --abbrev-ref HEAD")
    .toString()
    .trim(),
  GIT_COMMIT: require("child_process")
    .execSync("git rev-parse HEAD")
    .toString()
    .trim(),
  BUILD_TIME: new Date().toISOString(),
};
