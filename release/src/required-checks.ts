import "dotenv/config";
import { Octokit } from "@octokit/rest";

const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = process.env;

const github = new Octokit({ auth: GITHUB_TOKEN });

const config = {
  owner: GITHUB_OWNER || "",
  repo: GITHUB_REPO || "",
};

const targetBranch = process.argv[2];

function excludeBackportCheck(checks: string[]) {
  return checks.filter(c => c !== "Decide whether to backport or not");
}

async function setRequiredChecks(branch: string, contexts: string[]) {
  await github.rest.repos.updateBranchProtection({
    ...config,
    branch,
    required_status_checks: {
      strict: false,
      contexts,
    },
    restrictions: null,
    required_pull_request_reviews: null,
    enforce_admins: true,
  });
}

async function getRequiredChecksFromMaster() {
  const master = await github.rest.repos.getAllStatusCheckContexts({
    ...config,
    branch: "master",
  });

  const contexts = excludeBackportCheck(master.data);

  return contexts;
}

async function copyRequiredChecksToBranch(branch: string) {
  const contexts = await getRequiredChecksFromMaster();

  await setRequiredChecks(branch, contexts);
}

copyRequiredChecksToBranch(targetBranch).catch(e => {
  console.error(e);
  process.exit(1);
});
