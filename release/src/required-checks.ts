import "dotenv/config";
import { Octokit } from "@octokit/rest";
import "zx/globals";
$.verbose = false;

const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = process.env;

const github = new Octokit({ auth: GITHUB_TOKEN });

const config = {
  owner: GITHUB_OWNER || "",
  repo: GITHUB_REPO || "",
};

const targetBranch = process.argv[2];

if (!targetBranch) {
  console.error(chalk.red("You must provide a target branch name"));
  console.log("Usage: ", chalk.blue("yarn copy-required-checks <branch-to-copy-to>"));
  process.exit(1);
}

function filterChecks(checks: string[]) {
  const checksToExclude = ["Decide whether to backport or not"];
  return checks.filter(check => !checksToExclude.includes(check));
}

async function setRequiredChecks(branchName: string, masterCheckList: string[]) {
  await github.rest.repos.updateBranchProtection({
    ...config,
    branch: branchName,
    required_status_checks: {
      strict: false,
      contexts: masterCheckList,
    },
    restrictions: null,
    required_pull_request_reviews: null,
    enforce_admins: true,
  });

  console.log(chalk.green(`✅ ${masterCheckList.length} required checks copied to ${branchName}`));
}

async function getRequiredChecksFromMaster() {
  const { data: masterCheckList } = await github.rest.repos.getAllStatusCheckContexts({
    ...config,
    branch: "master",
  });

  const filteredCheckList = filterChecks(masterCheckList);

  return filteredCheckList;
}

async function copyRequiredChecksToBranch(branchName: string) {
  const masterCheckList = await getRequiredChecksFromMaster();

  await setRequiredChecks(branchName, masterCheckList);
}

copyRequiredChecksToBranch(targetBranch).catch(e => {
  console.error(e);
  process.exit(1);
});
