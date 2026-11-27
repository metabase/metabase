const { spawnSync } = require("child_process");

const getGitOutput = (args) => {
  const { status, stdout } = spawnSync("git", args, { encoding: "utf8" });
  return status === 0 ? stdout.trim() : "?";
};

module.exports.getBuildInfoValues = ({ version }) => ({
  ...(version && { VERSION: version }),
  GIT_BRANCH: getGitOutput(["rev-parse", "--abbrev-ref", "HEAD"]),
  GIT_COMMIT_SHA: getGitOutput(["rev-parse", "HEAD"]).slice(0, 7),
  BUILD_TIME: new Date().toISOString(),
});
