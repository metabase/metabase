const github = require("@actions/github");

const releaseBranches = await github.git.listMatchingRefs({
  owner: context.repo.owner,
  repo: context.repo.repo,
  ref: "heads/release-x.",
});

const getVersionFromBranch = branch => {
  const match = branch.match(/release-x\.(.*?)\.x/);
  return match && parseInt(match[1]);
};
const latestReleaseBranch = releaseBranches.data
  .filter(branch => getVersionFromBranch(branch.ref) !== null)
  .reduce(
    (prev, current) =>
      getVersionFromBranch(prev.ref) > getVersionFromBranch(current.ref)
        ? prev
        : current,
    { ref: "" },
  );
const latestReleaseBranchName = latestReleaseBranch.ref.replace(
  /^refs\/heads\//,
  "",
);

console.log(`Latest release branch: ${latestReleaseBranchName}`);

core.setOutput("branch-name", latestReleaseBranchName);
