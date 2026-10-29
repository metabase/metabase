// Every call that leaves this machine: GitHub, npm, Docker Hub, the Shoppy
// production instance, and the clone, push and install of the sample repos.
// They all go through one backend, so `--fake` and the tests can swap it.
import { $ } from "bun";

export const METABASE_REPO = "metabase/metabase";
export const SHOPPY_PRODUCTION_URL = "https://shoppy.metabaseapp.com";

export type PullRequest = {
  number: number;
  state: "OPEN" | "CLOSED" | "MERGED";
  url: string;
  title: string;
  headRefName: string;
  isDraft: boolean;
  isCrossRepository: boolean;
};

export type WorkflowRun = {
  status: string;
  conclusion: string;
  displayTitle: string;
  url: string;
  // ISO 8601, so two of them compare as strings
  createdAt: string;
};

// "npm", or the Yarn 1 of packageManager, for example "yarn@1.22.22"
export type PackageManager = "npm" | `yarn@1${string}`;

export type ExternalCalls = {
  makeSureGhIsLoggedIn(): Promise<void>;

  // null when the file or the branch does not exist
  readFileOnBranch(
    repo: string,
    file: string,
    branch: string,
  ): Promise<string | null>;
  // the blob sha is what GitHub needs to commit a new version of the file
  readFileAndItsShaOnBranch(
    repo: string,
    file: string,
    branch: string,
  ): Promise<{ text: string; sha: string }>;
  // fails when the file changed since we read its sha; returns the URL of the
  // new commit
  commitFileOnBranch(
    repo: string,
    file: string,
    commit: { text: string; sha: string; branch: string; message: string },
  ): Promise<string>;
  shaOfBranch(repo: string, branch: string): Promise<string | null>;
  // "ahead": head has commits that base does not have. "behind": the
  // opposite. "identical" or "diverged" otherwise.
  compareBranches(repo: string, base: string, head: string): Promise<string>;
  defaultBranchOf(repo: string): Promise<string>;

  // every PR (open, closed or merged) from `head` to `base`, no forks
  findPullRequestsFromBranch(
    repo: string,
    head: string,
    base: string,
  ): Promise<PullRequest[]>;
  findOpenPullRequestsTo(repo: string, base: string): Promise<PullRequest[]>;
  // every PR (open, closed or merged) to `base` whose branch starts with
  // `headPrefix`, newest first, no forks
  findPullRequestsWithBranchPrefix(
    repo: string,
    headPrefix: string,
    base: string,
  ): Promise<PullRequest[]>;
  // returns the URL of the new PR
  openPullRequest(
    repo: string,
    pullRequest: { base: string; head: string; title: string; body: string },
  ): Promise<string>;

  // the runs of a workflow, newest first, on one branch or on all of them; for
  // a pull_request run, the branch is the PR's head branch
  findWorkflowRuns(
    repo: string,
    workflow: string,
    branch?: string,
  ): Promise<WorkflowRun[]>;
  dispatchWorkflow(
    workflow: string,
    branch: string,
    inputs: Record<string, string>,
  ): Promise<void>;
  // "active", "disabled_inactivity", "disabled_manually", or "missing"
  stateOfWorkflow(repo: string, workflow: string): Promise<string>;

  // a clone of main, with only the last commit
  cloneMainInto(repo: string, folder: string): Promise<void>;
  // with no --force: fails when the branch already exists
  pushNewBranch(repo: string, folder: string, branch: string): Promise<void>;
  // updates only the lockfile in `folder`, and skips install scripts
  updateLockfileIn(
    folder: string,
    packageManager: PackageManager,
  ): Promise<void>;

  npmDistTags(): Promise<Record<string, string>>;
  doesDockerImageTagExist(tag: string): Promise<boolean>;
  // for example "v1.64.3.4", or null when the instance does not answer
  metabaseVersionOfShoppyProduction(): Promise<string | null>;
};

let externalCalls: ExternalCalls = realExternalCalls();
// the checks of one round share one read of npm; the next round reads it again
let distTags: Promise<Record<string, string>> | null = null;

// for `--fake` and the tests
export function replaceExternalCalls(replacement: ExternalCalls): void {
  externalCalls = replacement;
  distTags = null;
}

export const makeSureGhIsLoggedIn = () => externalCalls.makeSureGhIsLoggedIn();

export const readFileOnBranch: ExternalCalls["readFileOnBranch"] = (...args) =>
  externalCalls.readFileOnBranch(...args);

export const readFileAndItsShaOnBranch: ExternalCalls["readFileAndItsShaOnBranch"] =
  (...args) => externalCalls.readFileAndItsShaOnBranch(...args);

export const commitFileOnBranch: ExternalCalls["commitFileOnBranch"] = (
  ...args
) => externalCalls.commitFileOnBranch(...args);

export const shaOfBranch: ExternalCalls["shaOfBranch"] = (...args) =>
  externalCalls.shaOfBranch(...args);

export async function doesBranchExist(
  repo: string,
  branch: string,
): Promise<boolean> {
  return (await externalCalls.shaOfBranch(repo, branch)) != null;
}

export const compareBranches: ExternalCalls["compareBranches"] = (...args) =>
  externalCalls.compareBranches(...args);

export const defaultBranchOf: ExternalCalls["defaultBranchOf"] = (...args) =>
  externalCalls.defaultBranchOf(...args);

export const findPullRequestsFromBranch: ExternalCalls["findPullRequestsFromBranch"] =
  (...args) => externalCalls.findPullRequestsFromBranch(...args);

export const findOpenPullRequestsTo: ExternalCalls["findOpenPullRequestsTo"] = (
  ...args
) => externalCalls.findOpenPullRequestsTo(...args);

export const findPullRequestsWithBranchPrefix: ExternalCalls["findPullRequestsWithBranchPrefix"] =
  (...args) => externalCalls.findPullRequestsWithBranchPrefix(...args);

export const openPullRequest: ExternalCalls["openPullRequest"] = (...args) =>
  externalCalls.openPullRequest(...args);

export const findWorkflowRuns: ExternalCalls["findWorkflowRuns"] = (...args) =>
  externalCalls.findWorkflowRuns(...args);

export const dispatchWorkflow: ExternalCalls["dispatchWorkflow"] = (...args) =>
  externalCalls.dispatchWorkflow(...args);

export const stateOfWorkflow: ExternalCalls["stateOfWorkflow"] = (...args) =>
  externalCalls.stateOfWorkflow(...args);

export const cloneMainInto: ExternalCalls["cloneMainInto"] = (...args) =>
  externalCalls.cloneMainInto(...args);

export const pushNewBranch: ExternalCalls["pushNewBranch"] = (...args) =>
  externalCalls.pushNewBranch(...args);

export const updateLockfileIn: ExternalCalls["updateLockfileIn"] = (...args) =>
  externalCalls.updateLockfileIn(...args);

// at the start of each check round, so that `r` sees a new version on npm
export function forgetNpmDistTags(): void {
  distTags = null;
}

export function readNpmDistTags(): Promise<Record<string, string>> {
  if (!distTags) {
    const reading = externalCalls.npmDistTags();
    distTags = reading;
    // we do not keep a failed read: the next check tries again
    reading.catch(() => {
      if (distTags === reading) {
        distTags = null;
      }
    });
  }
  return distTags;
}

// undefined when npm has no such dist-tag
export async function npmVersionWithDistTag(
  distTag: string,
): Promise<string | undefined> {
  return (await readNpmDistTags())[distTag];
}

export const doesDockerImageTagExist: ExternalCalls["doesDockerImageTagExist"] =
  (...args) => externalCalls.doesDockerImageTagExist(...args);

export const metabaseVersionOfShoppyProduction: ExternalCalls["metabaseVersionOfShoppyProduction"] =
  () => externalCalls.metabaseVersionOfShoppyProduction();

// The real calls: gh, git, npm, yarn and fetch

export function realExternalCalls(): ExternalCalls {
  return {
    async makeSureGhIsLoggedIn() {
      await gh(["auth", "status"]);
    },

    readFileOnBranch: (repo, file, branch) =>
      ghApi(contentsEndpoint(repo, file, branch), "application/vnd.github.raw"),

    async readFileAndItsShaOnBranch(repo, file, branch) {
      const content: { sha: string; content: string } = JSON.parse(
        await requireApi(contentsEndpoint(repo, file, branch)),
      );
      return {
        text: Buffer.from(content.content, "base64").toString("utf8"),
        sha: content.sha,
      };
    },

    async commitFileOnBranch(repo, file, commit) {
      const json = await gh([
        "api",
        "-X",
        "PUT",
        contentsEndpoint(repo, file),
        "-f",
        `message=${commit.message}`,
        "-f",
        `content=${Buffer.from(commit.text, "utf8").toString("base64")}`,
        "-f",
        `sha=${commit.sha}`,
        "-f",
        `branch=${commit.branch}`,
      ]);
      const response: { commit: { html_url: string } } = JSON.parse(json);
      return response.commit.html_url;
    },

    async shaOfBranch(repo, branch) {
      // git/ref (singular) matches the exact name, git/refs also matches prefixes
      const json = await ghApi(`repos/${repo}/git/ref/heads/${branch}`);
      if (json == null) {
        return null;
      }
      const ref: { object: { sha: string } } = JSON.parse(json);
      return ref.object.sha;
    },

    async compareBranches(repo, base, head) {
      const comparison: { status: string } = JSON.parse(
        await requireApi(`repos/${repo}/compare/${base}...${head}`),
      );
      return comparison.status;
    },

    async defaultBranchOf(repo) {
      const repoInfo: { default_branch: string } = JSON.parse(
        await requireApi(`repos/${repo}`),
      );
      return repoInfo.default_branch;
    },

    // We look PRs up by branch name: a plain `gh pr list` stops at 30 PRs and
    // misses old ones.
    async findPullRequestsFromBranch(repo, head, base) {
      const pullRequests: PullRequest[] = JSON.parse(
        await gh([
          "pr",
          "list",
          "--repo",
          repo,
          "--head",
          head,
          "--base",
          base,
          "--state",
          "all",
          "--json",
          PULL_REQUEST_FIELDS,
        ]),
      );
      return pullRequests.filter((pr) => !pr.isCrossRepository);
    },

    async findOpenPullRequestsTo(repo, base) {
      return JSON.parse(
        await gh([
          "pr",
          "list",
          "--repo",
          repo,
          "--base",
          base,
          "--state",
          "open",
          "--limit",
          "1000",
          "--json",
          PULL_REQUEST_FIELDS,
        ]),
      );
    },

    // the search qualifier head: matches the start of the branch name
    async findPullRequestsWithBranchPrefix(repo, headPrefix, base) {
      const pullRequests: PullRequest[] = JSON.parse(
        await gh([
          "pr",
          "list",
          "--repo",
          repo,
          "--base",
          base,
          "--state",
          "all",
          "--search",
          `head:${headPrefix}`,
          "--limit",
          "30",
          "--json",
          PULL_REQUEST_FIELDS,
        ]),
      );
      return pullRequests.filter(
        (pr) => !pr.isCrossRepository && pr.headRefName.startsWith(headPrefix),
      );
    },

    async openPullRequest(repo, pullRequest) {
      const url = await gh([
        "pr",
        "create",
        "--repo",
        repo,
        "--base",
        pullRequest.base,
        "--head",
        pullRequest.head,
        "--title",
        pullRequest.title,
        "--body",
        pullRequest.body,
      ]);
      return url.trim();
    },

    async findWorkflowRuns(repo, workflow, branch) {
      return JSON.parse(
        await gh([
          "run",
          "list",
          "--repo",
          repo,
          "--workflow",
          workflow,
          ...(branch ? ["--branch", branch] : []),
          "--limit",
          "10",
          "--json",
          "status,conclusion,displayTitle,url,createdAt",
        ]),
      );
    },

    async dispatchWorkflow(workflow, branch, inputs) {
      await gh([
        "workflow",
        "run",
        workflow,
        "--repo",
        METABASE_REPO,
        "--ref",
        branch,
        ...Object.entries(inputs).flatMap(([name, value]) => [
          "-f",
          `${name}=${value}`,
        ]),
      ]);
    },

    async stateOfWorkflow(repo, workflow) {
      const json = await ghApi(`repos/${repo}/actions/workflows/${workflow}`);
      if (json == null) {
        return "missing";
      }
      const workflowInfo: { state: string } = JSON.parse(json);
      return workflowInfo.state;
    },

    async cloneMainInto(repo, folder) {
      await $`gh repo clone ${repo} ${folder} -- --depth 1 --branch main`.quiet();
    },

    // `gh repo clone` gives gh's login to the clone only, so the push asks
    // gh again
    async pushNewBranch(_repo, folder, branch) {
      // we push only if the branch is still missing on GitHub: a plain push
      // would fast-forward a branch that someone created after our check
      const onlyIfMissing = `--force-with-lease=refs/heads/${branch}:`;
      await $`git -c ${"credential.helper="} -c ${"credential.helper=!gh auth git-credential"} push ${onlyIfMissing} -u origin ${branch}`.cwd(
        folder,
      );
    },

    async updateLockfileIn(folder, packageManager) {
      if (packageManager === "npm") {
        await $`npm install --package-lock-only --ignore-scripts --no-audit --no-fund`.cwd(
          folder,
        );
        return;
      }
      await $`npx --yes ${packageManager} install --ignore-scripts --non-interactive`.cwd(
        folder,
      );
    },

    async npmDistTags() {
      const response = await fetch(
        "https://registry.npmjs.org/-/package/@metabase/embedding-sdk-react/dist-tags",
      );
      if (!response.ok) {
        throw new Error(`npm dist-tags: HTTP ${response.status}`);
      }
      return JSON.parse(await response.text());
    },

    async doesDockerImageTagExist(tag) {
      const response = await fetch(
        `https://hub.docker.com/v2/namespaces/metabase/repositories/metabase-enterprise/tags/${tag}`,
      );
      if (response.status === 404) {
        return false;
      }
      if (!response.ok) {
        throw new Error(`Docker Hub tag ${tag}: HTTP ${response.status}`);
      }
      return true;
    },

    async metabaseVersionOfShoppyProduction() {
      try {
        const response = await fetch(
          `${SHOPPY_PRODUCTION_URL}/api/session/properties`,
        );
        const properties: { version?: { tag?: string } } = JSON.parse(
          await response.text(),
        );
        return properties.version?.tag ?? null;
      } catch {
        return null;
      }
    },
  };
}

const PULL_REQUEST_FIELDS =
  "number,state,url,title,headRefName,isDraft,isCrossRepository";

// runs gh quietly, and puts its stderr in the error
async function gh(args: string[]): Promise<string> {
  const result = await $`gh ${args}`.nothrow().quiet();
  if (result.exitCode !== 0) {
    throw new Error(
      `gh ${args.slice(0, 2).join(" ")}: ${result.stderr.toString().trim()}`,
    );
  }
  return result.stdout.toString();
}

// null on a 404, so callers can ask "does it exist?"
async function ghApi(
  endpoint: string,
  accept?: string,
): Promise<string | null> {
  const headers = accept ? ["-H", `Accept: ${accept}`] : [];
  const result = await $`gh api ${headers} ${endpoint}`.nothrow().quiet();
  if (result.exitCode === 0) {
    return result.stdout.toString();
  }
  const stderr = result.stderr.toString();
  if (stderr.includes("HTTP 404")) {
    return null;
  }
  throw new Error(`gh api ${endpoint}: ${stderr.trim()}`);
}

async function requireApi(endpoint: string): Promise<string> {
  const json = await ghApi(endpoint);
  if (json == null) {
    throw new Error(`gh api ${endpoint}: not found`);
  }
  return json;
}

function contentsEndpoint(repo: string, file: string, branch?: string): string {
  const query = branch ? `?ref=${encodeURIComponent(branch)}` : "";
  return `repos/${repo}/contents/${file}${query}`;
}
