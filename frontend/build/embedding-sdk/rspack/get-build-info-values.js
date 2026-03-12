module.exports.getBuildInfoValues = ({ version }) => ({
  ...(version && { VERSION: version }),
  GIT_BRANCH: require("child_process")
    .execSync("git rev-parse --abbrev-ref HEAD")
    .toString()
    .trim(),
  GIT_COMMIT_SHA: require("child_process")
    .execSync("git rev-parse HEAD")
    .toString()
    .trim()
    .slice(0, 7),
  BUILD_TIME: new Date().toISOString(),
});
