// A fake of every external call, for `--fake` and the tests. GitHub, npm,
// Docker Hub and Shoppy live in a "world" object. Every call loads the world
// from a store and every write saves it back, so with a file store the next
// run, and any hand edit of the file, sees the changes.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { $ } from "bun";

import {
  type SdkReleaseType,
  computeNextSdkVersion,
  computeSdkDistTag,
} from "../src/embedding-sdk-release-helpers";

import { BUMP_WORKFLOW, PACKAGE_TEMPLATE } from "./embedding-sdk-version-bumps";
import type { ExternalCalls, PullRequest, WorkflowRun } from "./external-calls";

export type FakeWorld = {
  // "<repo>@<branch>" -> the files of that branch
  branches: Record<string, Record<string, string>>;
  pullRequests: (PullRequest & { repo: string; base: string; body?: string })[];
  // oldest first; a missing repo means metabase/metabase, and a missing
  // createdAt means "older than every run that has one"
  workflowRuns: (Omit<WorkflowRun, "createdAt"> & {
    createdAt?: string;
    repo?: string;
    workflow: string;
    branch: string;
  })[];
  // missing means "main"
  defaultBranches: Record<string, string>;
  // "<repo>:<workflow>" -> state; missing means "active"
  workflowStates: Record<string, string>;
  npmDistTags: Record<string, string>;
  dockerImageTags: string[];
  shoppyProductionVersion: string | null;
  // the LATEST_MAJOR_VERSION variable that the bump workflow reads
  latestMajorVersion: string;
  // "<repo>:<base>...<head>" -> the result of compareBranches, for states the
  // fake cannot compute (it has no history)
  comparisons?: Record<string, string>;
};

export type FakeStore = {
  load(): FakeWorld;
  save(world: FakeWorld): void;
};

// The world lives in a JSON file. The first run creates it from the scenario.
export function fakeStoreInFile(
  file: string,
  scenario: () => FakeWorld,
): FakeStore {
  if (!existsSync(file)) {
    writeFileSync(file, `${JSON.stringify(scenario(), null, 2)}\n`);
  }
  return {
    load: (): FakeWorld => JSON.parse(readFileSync(file, "utf8")),
    save: (world) => writeFileSync(file, `${JSON.stringify(world, null, 2)}\n`),
  };
}

export function fakeStoreInMemory(world: FakeWorld): FakeStore {
  let current = structuredClone(world);
  return {
    load: () => structuredClone(current),
    save: (world) => {
      current = structuredClone(world);
    },
  };
}

export function fakeExternalCalls(store: FakeStore): ExternalCalls {
  return {
    async makeSureGhIsLoggedIn() {},

    async readFileOnBranch(repo, file, branch) {
      return filesOf(store.load(), repo, branch)?.[file] ?? null;
    },

    async readFileAndItsShaOnBranch(repo, file, branch) {
      const text = filesOf(store.load(), repo, branch)?.[file];
      if (text == null) {
        throw new Error(`fake: ${repo}@${branch} has no ${file}`);
      }
      return { text, sha: shaOf(text) };
    },

    async commitFileOnBranch(repo, file, commit) {
      change(store, (world) => {
        const files = filesOf(world, repo, commit.branch);
        if (!files) {
          throw new Error(`fake: ${repo} has no branch ${commit.branch}`);
        }
        if (shaOf(files[file] ?? "") !== commit.sha) {
          throw new Error(`fake: ${file} changed since its sha was read`);
        }
        files[file] = commit.text;
      });
      say(`committed ${file} to ${repo}@${commit.branch}: "${commit.message}"`);
      return `https://github.com/${repo}/commit/fake-${shaOf(commit.text)}`;
    },

    async shaOfBranch(repo, branch) {
      const files = filesOf(store.load(), repo, branch);
      return files ? shaOf(JSON.stringify(files)) : null;
    },

    // the fake has no history: same files are "identical", others "ahead"
    async compareBranches(repo, base, head) {
      const world = store.load();
      const forced = world.comparisons?.[`${repo}:${base}...${head}`];
      if (forced) {
        return forced;
      }
      const baseFiles = JSON.stringify(filesOf(world, repo, base));
      const headFiles = JSON.stringify(filesOf(world, repo, head));
      return baseFiles === headFiles ? "identical" : "ahead";
    },

    async defaultBranchOf(repo) {
      return store.load().defaultBranches[repo] ?? "main";
    },

    async findPullRequestsFromBranch(repo, head, base) {
      return store
        .load()
        .pullRequests.filter(
          (pr) =>
            pr.repo === repo && pr.headRefName === head && pr.base === base,
        );
    },

    async findOpenPullRequestsTo(repo, base) {
      return store
        .load()
        .pullRequests.filter(
          (pr) => pr.repo === repo && pr.base === base && pr.state === "OPEN",
        );
    },

    async findPullRequestsWithBranchPrefix(repo, headPrefix, base) {
      return store
        .load()
        .pullRequests.filter(
          (pr) =>
            pr.repo === repo &&
            pr.base === base &&
            pr.headRefName.startsWith(headPrefix),
        )
        .reverse();
    },

    async openPullRequest(repo, pullRequest) {
      return change(store, (world) => {
        if (!filesOf(world, repo, pullRequest.head)) {
          throw new Error(`fake: ${repo} has no branch ${pullRequest.head}`);
        }
        return openFakePullRequest(world, repo, pullRequest);
      });
    },

    async findWorkflowRuns(repo, workflow, branch) {
      return store
        .load()
        .workflowRuns.filter(
          (run) =>
            (run.repo ?? METABASE) === repo &&
            run.workflow === workflow &&
            (branch === undefined || run.branch === branch),
        )
        .reverse()
        .map((run) => ({ ...run, createdAt: run.createdAt ?? "" }));
    },

    async dispatchWorkflow(workflow, branch, inputs) {
      const releaseType = inputs.release_type;
      if (workflow !== BUMP_WORKFLOW || !isSdkReleaseType(releaseType)) {
        throw new Error(
          `fake: no fake for ${workflow} ${JSON.stringify(inputs)}`,
        );
      }
      change(store, (world) => runFakeBumpWorkflow(world, branch, releaseType));
    },

    async stateOfWorkflow(repo, workflow) {
      return store.load().workflowStates[`${repo}:${workflow}`] ?? "active";
    },

    // a real local git repo, made from the files in the world
    async cloneMainInto(repo, folder) {
      const files = filesOf(store.load(), repo, "main");
      if (!files) {
        throw new Error(`fake: ${repo} has no main`);
      }
      for (const [file, text] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(folder, file)), { recursive: true });
        await writeFile(path.join(folder, file), text);
      }
      await $`git init -q -b main`.cwd(folder);
      await $`git add -A`.cwd(folder);
      await $`git -c user.name=fake -c user.email=fake@example.com commit -q -m main`.cwd(
        folder,
      );
      say(`cloned ${repo} into ${folder}, from the fake world`);
    },

    async pushNewBranch(repo, folder, branch) {
      const tracked = (await $`git ls-files -z`.cwd(folder).text())
        .split("\0")
        .filter(Boolean);
      const files: Record<string, string> = {};
      for (const file of tracked) {
        files[file] = await readFile(path.join(folder, file), "utf8");
      }
      change(store, (world) => {
        if (filesOf(world, repo, branch)) {
          throw new Error(`fake: ${repo} already has a branch ${branch}`);
        }
        world.branches[`${repo}@${branch}`] = files;
      });
      say(`pushed ${branch} to ${repo}`);
    },

    // like npm and yarn: the lockfile locks the newest stable version of the
    // major in the package.json range
    async updateLockfileIn(folder, packageManager) {
      const packageJson: { dependencies?: Record<string, string> } = JSON.parse(
        await readFile(path.join(folder, "package.json"), "utf8"),
      );
      const range = packageJson.dependencies?.[SDK_PACKAGE] ?? "";
      const major = /0\.(\d+)\./.exec(range)?.[1];
      const version = store.load().npmDistTags[`${major}-stable`];
      if (!version) {
        throw new Error(`fake: npm has no ${major}-stable for ${range}`);
      }
      if (packageManager === "npm") {
        await lockInPackageLock(folder, range, version);
      } else {
        await lockInYarnLock(folder, range, version);
      }
      say(`${packageManager} updated the lockfile in ${folder}: ${version}`);
    },

    async npmDistTags() {
      return store.load().npmDistTags;
    },

    async doesDockerImageTagExist(tag) {
      return store.load().dockerImageTags.includes(tag);
    },

    async metabaseVersionOfShoppyProduction() {
      return store.load().shoppyProductionVersion;
    },
  };
}

// What a person does by hand on GitHub or Cloud. In fake mode, the TUI offers
// these on the m key, because the ✋ steps print real commands.
export type FakeHumanAction = { label: string; run: () => void };

export function fakeHumanActions(store: FakeStore): FakeHumanAction[] {
  const world = store.load();
  const actions: FakeHumanAction[] = [];

  for (const pr of world.pullRequests.filter((pr) => pr.state === "OPEN")) {
    actions.push({
      label: `merge ${pr.url} (${pr.title})`,
      run: () => store.save(mergeFakePullRequest(store.load(), pr.number)),
    });
  }

  for (const key of newestStableBranches(world)) {
    const [repo, branch] = key.split("@");
    const main = world.branches[`${repo}@main`];
    if (main && JSON.stringify(main) !== JSON.stringify(world.branches[key])) {
      actions.push({
        label: `fast-forward ${repo} ${branch} to main`,
        run: () =>
          change(store, (world) => {
            world.branches[key] = { ...world.branches[`${repo}@main`] };
            say(`fast-forwarded ${repo} ${branch} to main`);
          }),
      });
    }
    if ((world.defaultBranches[repo] ?? "main") !== branch) {
      actions.push({
        label: `make ${branch} the default branch of ${repo}`,
        run: () =>
          change(store, (world) => {
            world.defaultBranches[repo] = branch;
            say(`${repo} has the default branch ${branch} now`);
          }),
      });
    }
  }

  const newestImageMajor = Math.max(
    ...world.dockerImageTags.map((tag) => Number(/^v1\.(\d+)/.exec(tag)?.[1])),
  );
  if (!world.shoppyProductionVersion?.startsWith(`v1.${newestImageMajor}.`)) {
    actions.push({
      label: `upgrade the Shoppy production instance to v1.${newestImageMajor}.0`,
      run: () =>
        change(store, (world) => {
          world.shoppyProductionVersion = `v1.${newestImageMajor}.0`;
          say(`Shoppy production runs v1.${newestImageMajor}.0 now`);
        }),
    });
  }

  return actions;
}

// What a merge on GitHub does. After a bump PR, release-embedding-sdk.yml
// also runs: it publishes the version under its dist-tag, and moves latest
// when the template says so.
function mergeFakePullRequest(world: FakeWorld, number: number): FakeWorld {
  const pr = world.pullRequests.find(
    (pr) => pr.number === number && pr.state === "OPEN",
  );
  if (!pr) {
    throw new Error(`fake: no open PR #${number}`);
  }
  pr.state = "MERGED";
  world.branches[`${pr.repo}@${pr.base}`] = {
    ...world.branches[`${pr.repo}@${pr.base}`],
    ...world.branches[`${pr.repo}@${pr.headRefName}`],
  };
  say(`merged ${pr.url}`);

  if (pr.repo === METABASE && pr.headRefName.startsWith("sdk-version-bump-")) {
    const template: {
      version: string;
      sdkRelease?: { distTag?: string; tagAsLatest?: boolean };
    } = JSON.parse(world.branches[`${METABASE}@${pr.base}`][PACKAGE_TEMPLATE]);
    world.workflowRuns.push({
      workflow: "release-embedding-sdk.yml",
      branch: pr.headRefName,
      status: "completed",
      conclusion: "success",
      displayTitle: `Release SDK ${template.version}`,
      url: `https://github.com/${METABASE}/actions/runs/fake-release-${template.version}`,
      createdAt: new Date().toISOString(),
    });
    const distTag = template.sdkRelease?.distTag;
    if (distTag) {
      world.npmDistTags[distTag] = template.version;
    }
    if (template.sdkRelease?.tagAsLatest) {
      world.npmDistTags.latest = template.version;
    }
    say(
      `the release run published ${template.version} on npm ${distTag}${template.sdkRelease?.tagAsLatest ? " and latest" : ""}`,
    );
  }
  return world;
}

const SDK_PACKAGE = "@metabase/embedding-sdk-react";
const METABASE = "metabase/metabase";

function say(line: string): void {
  console.log(`  [fake] ${line}`);
}

// "<repo>@<N>-stable" with the highest N of each repo: older stable branches
// stay as they are
function newestStableBranches(world: FakeWorld): string[] {
  const newest = new Map<string, number>();
  for (const key of Object.keys(world.branches)) {
    const [repo, branch] = key.split("@");
    const major = Number(/^(\d+)-stable$/.exec(branch)?.[1]);
    if (major > (newest.get(repo) ?? 0)) {
      newest.set(repo, major);
    }
  }
  return [...newest].map(([repo, major]) => `${repo}@${major}-stable`);
}

// loads the world, changes it, and saves it
function change<T>(store: FakeStore, write: (world: FakeWorld) => T): T {
  const world = store.load();
  const result = write(world);
  store.save(world);
  return result;
}

function filesOf(
  world: FakeWorld,
  repo: string,
  branch: string,
): Record<string, string> | undefined {
  return world.branches[`${repo}@${branch}`];
}

// What sdk-version-bump-pr.yml does: a new branch with the bumped template,
// and a PR from it to the branch it ran on.
function runFakeBumpWorkflow(
  world: FakeWorld,
  branch: string,
  releaseType: SdkReleaseType,
): void {
  const files = world.branches[`${METABASE}@${branch}`];
  const template: { version: string } = JSON.parse(files[PACKAGE_TEMPLATE]);
  const newVersion = computeNextSdkVersion({
    currentVersion: template.version,
    releaseType,
    prereleaseId: "",
  });
  const bumpBranch = `sdk-version-bump-${newVersion}`;
  if (world.branches[`${METABASE}@${bumpBranch}`]) {
    throw new Error(`fake: the bump workflow fails, ${bumpBranch} exists`);
  }

  const tagAsLatest =
    releaseType === "patch" &&
    branch === `release-x.${world.latestMajorVersion}.x`;
  world.branches[`${METABASE}@${bumpBranch}`] = {
    ...files,
    [PACKAGE_TEMPLATE]: `${JSON.stringify(
      {
        ...template,
        version: newVersion,
        sdkRelease: {
          distTag: computeSdkDistTag({ newVersion, releaseType }),
          tagAsLatest,
        },
      },
      null,
      2,
    )}\n`,
  };
  world.workflowRuns.push({
    workflow: BUMP_WORKFLOW,
    branch,
    status: "completed",
    conclusion: "success",
    displayTitle: `Bump Embedding SDK version (${releaseType}) on ${branch}`,
    url: `https://github.com/${METABASE}/actions/runs/fake-bump-${newVersion}`,
    createdAt: new Date().toISOString(),
  });
  say(
    `the bump workflow ran on ${branch}: ${template.version} -> ${newVersion}`,
  );
  openFakePullRequest(world, METABASE, {
    base: branch,
    head: bumpBranch,
    title: `chore(sdk): bump SDK version on ${branch} to ${newVersion}`,
  });
}

function openFakePullRequest(
  world: FakeWorld,
  repo: string,
  pullRequest: { base: string; head: string; title: string; body?: string },
): string {
  const isAlreadyOpen = world.pullRequests.some(
    (pr) =>
      pr.repo === repo &&
      pr.headRefName === pullRequest.head &&
      pr.base === pullRequest.base &&
      pr.state === "OPEN",
  );
  if (isAlreadyOpen) {
    throw new Error(`fake: a PR from ${pullRequest.head} is already open`);
  }
  const number = 90000 + world.pullRequests.length;
  const url = `https://github.com/${repo}/pull/${number}`;
  world.pullRequests.push({
    repo,
    base: pullRequest.base,
    number,
    state: "OPEN",
    url,
    title: pullRequest.title,
    body: pullRequest.body,
    headRefName: pullRequest.head,
    isDraft: false,
    isCrossRepository: false,
  });
  say(`opened ${url}: "${pullRequest.title}"`);
  return url;
}

async function lockInPackageLock(
  folder: string,
  range: string,
  version: string,
): Promise<void> {
  const file = path.join(folder, "package-lock.json");
  const lock: {
    packages: Record<
      string,
      { version?: string; dependencies?: Record<string, string> }
    >;
  } = JSON.parse(await readFile(file, "utf8"));
  lock.packages[""] = {
    ...lock.packages[""],
    dependencies: { ...lock.packages[""]?.dependencies, [SDK_PACKAGE]: range },
  };
  lock.packages[`node_modules/${SDK_PACKAGE}`] = {
    ...lock.packages[`node_modules/${SDK_PACKAGE}`],
    version,
  };
  await writeFile(file, `${JSON.stringify(lock, null, 2)}\n`);
}

async function lockInYarnLock(
  folder: string,
  range: string,
  version: string,
): Promise<void> {
  const file = path.join(folder, "yarn.lock");
  const text = await readFile(file, "utf8");
  await writeFile(
    file,
    text.replace(
      /^"@metabase\/embedding-sdk-react@[^"]*":\n {2}version "[^"]*"/m,
      `"${SDK_PACKAGE}@${range}":\n  version "${version}"`,
    ),
  );
}

function shaOf(text: string): string {
  return Bun.hash(text).toString(16);
}

function isSdkReleaseType(value: string | undefined): value is SdkReleaseType {
  return ["alpha", "beta", "preminor", "patch", "custom"].includes(value ?? "");
}
