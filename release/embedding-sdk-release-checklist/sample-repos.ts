// The steps that move the sample repos to the new major: a PR that changes
// the pins on main, then the <major>-stable branch and the default branch.
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { $ } from "bun";
import semver from "semver";

import {
  type Action,
  type ActionOutcome,
  type Interaction,
  type Link,
  type StepResult,
  askToContinueDespiteWarnings,
  blocked,
  done,
  error,
  inProgress,
  manual,
  todo,
  withLinks,
} from "./checklist";
import { didRunFail, embeddingSdkMajorOf } from "./embedding-sdk-version-bumps";
import {
  type PullRequest,
  SHOPPY_PRODUCTION_URL,
  cloneMainInto,
  compareBranches,
  defaultBranchOf,
  doesBranchExist,
  doesDockerImageTagExist,
  findOpenPullRequestsTo,
  findPullRequestsFromBranch,
  findWorkflowRuns,
  metabaseVersionOfShoppyProduction,
  npmVersionWithDistTag,
  openPullRequest,
  pushNewBranch,
  readFileOnBranch,
  shaOfBranch,
  stateOfWorkflow,
  updateLockfileIn,
} from "./external-calls";

export type SampleRepo = {
  name: string;
  // files that pin the Docker image, metabase/metabase-enterprise:v1.<major>.x
  imagePins: string[];
  // package.json files that pin "@metabase/embedding-sdk-react": "^0.<major>.0";
  // the lockfile next to each one changes with it
  embeddingSdkPins: string[];
  // the production frontend that a merge to main deploys, and the Metabase
  // instance it embeds from
  production?: { app: string; metabaseUrl: string };
};

export const NEXTJS: SampleRepo = {
  name: "metabase/metabase-nextjs-sdk-embedding-sample",
  imagePins: ["docker-compose.yml"],
  embeddingSdkPins: [
    "next-sample-app-router/package.json",
    "next-sample-pages-router/package.json",
  ],
};

export const REACT: SampleRepo = {
  name: "metabase/metabase-nodejs-react-sdk-embedding-sample",
  imagePins: ["docker-compose.yml"],
  embeddingSdkPins: ["client/package.json"],
};

// it loads embed.js from the Metabase instance, so it pins no Embedding SDK version
export const MODULAR: SampleRepo = {
  name: "metabase/metabase-nodejs-modular-embedding-sample",
  imagePins: ["docker-compose.yml"],
  embeddingSdkPins: [],
};

export const SHOPPY: SampleRepo = {
  name: "metabase/shoppy",
  imagePins: ["docker-compose.yml"],
  embeddingSdkPins: ["package.json"],
  production: { app: "Shoppy", metabaseUrl: SHOPPY_PRODUCTION_URL },
};

// the hourly workflow in nextjs and react that creates <major>-stable from main
const CREATE_STABLE_BRANCH_WORKFLOW = "create-version-branch.yml";

// Done when main pins <major> everywhere. Otherwise it offers to open the PR
// from the branch update-to-<major>.
export async function checkSampleRepo(
  repo: SampleRepo,
  major: number,
): Promise<StepResult> {
  return withLinks(await sampleRepoState(repo, major), {
    pullRequests: await updatePullRequestsOf(repo, major),
    links: expectedPins(repo).map(({ file }) => ({
      label: `${file} on main`,
      url: `https://github.com/${repo.name}/blob/main/${file}`,
    })),
  });
}

async function sampleRepoState(
  repo: SampleRepo,
  major: number,
): Promise<StepResult> {
  const updateBranch = `update-to-${major}`;

  if (await isBranchOnMajor(repo, "main", major)) {
    return done(`main pins ${major}`);
  }

  const updatePullRequests = await findPullRequestsFromBranch(
    repo.name,
    updateBranch,
    "main",
  );
  const openUpdatePr = updatePullRequests.find((pr) => pr.state === "OPEN");
  if (openUpdatePr) {
    return manual(`review and merge ${openUpdatePr.url}`);
  }
  const mergedUpdatePr = updatePullRequests.find((pr) => pr.state === "MERGED");
  if (mergedUpdatePr) {
    return error(
      `${mergedUpdatePr.url} is merged, but main is not on ${major}: ${await describePinsOnBranch(repo, "main")}`,
    );
  }
  const doesUpdateBranchExist = await doesBranchExist(repo.name, updateBranch);
  const closedUpdatePr = updatePullRequests.find((pr) => pr.state === "CLOSED");
  if (closedUpdatePr && doesUpdateBranchExist) {
    return manual(
      `${closedUpdatePr.url} is closed without a merge.`,
      `Delete the ${updateBranch} branch to start again.`,
    );
  }

  if (
    repo.embeddingSdkPins.length > 0 &&
    !(await isEmbeddingSdkMajorOnNpm(major))
  ) {
    return blocked(`the patch bump (npm has no ${major}-stable yet)`);
  }
  if (!(await doesDockerImageTagExist(`v1.${major}.x`))) {
    return blocked(
      `the Docker image metabase/metabase-enterprise:v1.${major}.x (not on Docker Hub yet)`,
    );
  }

  // someone can open the same update by hand, from another branch
  const otherOpenPrsAboutMajor =
    await findOtherOpenPullRequestsThatMentionMajor(repo, updateBranch, major);
  const warnings = otherOpenPrsAboutMajor.map(
    (pr) =>
      `${pr.url} (branch ${pr.headRefName}) is open and mentions ${major}: it can be the same update`,
  );
  const warningLines = warnings.map((warning) => `⚠️  ${warning}`);

  // a branch from an earlier run whose PR did not open
  if (doesUpdateBranchExist) {
    if (!(await isBranchOnMajor(repo, updateBranch, major))) {
      return manual(
        `${updateBranch} exists with no PR, and it is not on ${major}: ${await describePinsOnBranch(repo, updateBranch)}`,
        `Delete the ${updateBranch} branch to start again.`,
      );
    }
    return todo(
      openUpdatePrAction(repo, updateBranch, major, warnings),
      `${updateBranch} exists with no PR`,
      ...warningLines,
    );
  }
  return todo(
    updateSampleRepoAction(repo, major, warnings),
    `main: ${await describePinsOnBranch(repo, "main")}`,
    ...warningLines,
  );
}

// Shoppy production runs on a Metabase Cloud instance, and merging the Shoppy
// PR deploys the new Embedding SDK to it. Done when that instance already runs <major>.
export async function checkShoppyProductionInstance(
  major: number,
): Promise<StepResult> {
  return withLinks(await shoppyProductionInstanceState(major), {
    links: [{ label: "Shoppy production", url: SHOPPY_PRODUCTION_URL }],
  });
}

async function shoppyProductionInstanceState(
  major: number,
): Promise<StepResult> {
  const version = await metabaseVersionOfShoppyProduction();
  if (!version) {
    return error(`${SHOPPY_PRODUCTION_URL} did not tell its Metabase version`);
  }
  if (metabaseMajorOf(version) >= major) {
    return done(`${SHOPPY_PRODUCTION_URL} runs ${version}`);
  }
  return manual(
    `${SHOPPY_PRODUCTION_URL} runs ${version}. Merging the Shoppy PR deploys Embedding SDK 0.${major} against it.`,
    `Get the Cloud instance upgraded to ${major} before you merge the Shoppy PR. This script does not upgrade it.`,
  );
}

// After the PR merges, <major>-stable must contain main and be the default
// branch. This script only opens PRs, so it prints the commands for that.
export async function checkStableBranch(
  repo: SampleRepo,
  major: number,
): Promise<StepResult> {
  return withLinks(await stableBranchState(repo, major), {
    pullRequests: await updatePullRequestsOf(repo, major),
    links: await stableBranchLinksOf(repo, major),
  });
}

async function stableBranchLinksOf(
  repo: SampleRepo,
  major: number,
): Promise<Link[]> {
  const stableBranch = `${major}-stable`;
  const links: Link[] = [];
  if (await doesBranchExist(repo.name, stableBranch)) {
    links.push(
      {
        label: stableBranch,
        url: `https://github.com/${repo.name}/tree/${stableBranch}`,
      },
      {
        label: `what main has and ${stableBranch} does not`,
        url: `https://github.com/${repo.name}/compare/${stableBranch}...main`,
      },
    );
  }
  links.push(
    {
      label: "the default branch, in the repo settings",
      url: `https://github.com/${repo.name}/settings`,
    },
    {
      label: `the runs of ${CREATE_STABLE_BRANCH_WORKFLOW}`,
      url: `https://github.com/${repo.name}/actions/workflows/${CREATE_STABLE_BRANCH_WORKFLOW}`,
    },
  );
  return links;
}

async function stableBranchState(
  repo: SampleRepo,
  major: number,
): Promise<StepResult> {
  const stableBranch = `${major}-stable`;

  if (!(await isBranchOnMajor(repo, "main", major))) {
    return blocked(
      `the update PR of ${repo.name} (main is not on ${major} yet)`,
    );
  }

  if (!(await doesBranchExist(repo.name, stableBranch))) {
    const createItByHand = `Run: gh api -X POST repos/${repo.name}/git/refs -f ref=refs/heads/${stableBranch} -f sha=${await shaOfBranch(repo.name, "main")}`;
    const isCronActive =
      (await stateOfWorkflow(repo.name, CREATE_STABLE_BRANCH_WORKFLOW)) ===
      "active";
    // the cron names the branch after the major of npm latest
    if (isCronActive && (await isNpmLatestOnMajor(major))) {
      // a cron runs on the default branch, so we read its runs on every branch
      const [lastCronRun] = await findWorkflowRuns(
        repo.name,
        CREATE_STABLE_BRANCH_WORKFLOW,
      );
      if (lastCronRun && didRunFail(lastCronRun)) {
        return manual(
          `${stableBranch} does not exist, and the last run of the hourly ${CREATE_STABLE_BRANCH_WORKFLOW} failed: ${lastCronRun.url}`,
          createItByHand,
        );
      }
      return inProgress(
        `${stableBranch} does not exist yet: the hourly ${CREATE_STABLE_BRANCH_WORKFLOW} creates it from main`,
      );
    }
    return manual(
      `${stableBranch} does not exist, and ${CREATE_STABLE_BRANCH_WORKFLOW} will not create it.`,
      createItByHand,
    );
  }

  const comparison = await compareBranches(repo.name, stableBranch, "main");
  if (comparison === "diverged") {
    return manual(
      `${stableBranch} and main have diverged: reconcile them by hand`,
    );
  }
  if (comparison === "ahead") {
    return manual(
      `main has commits that ${stableBranch} does not have: fast-forward it.`,
      `Run: gh api -X PATCH repos/${repo.name}/git/refs/heads/${stableBranch} -f sha=${await shaOfBranch(repo.name, "main")} -F force=false`,
    );
  }
  if (!(await isBranchOnMajor(repo, stableBranch, major))) {
    return manual(
      `${stableBranch} contains main, but it is not on ${major}: ${await describePinsOnBranch(repo, stableBranch)}. Fix it by hand.`,
    );
  }

  const defaultBranch = await defaultBranchOf(repo.name);
  if (defaultBranch !== stableBranch) {
    return manual(
      `the default branch is ${defaultBranch}.`,
      `Run: gh repo edit ${repo.name} --default-branch ${stableBranch}`,
    );
  }
  return done(`${stableBranch} contains main and is the default branch`);
}

// The update action

function updateSampleRepoAction(
  repo: SampleRepo,
  major: number,
  warnings: string[],
): Action {
  const hasEmbeddingSdkPins = repo.embeddingSdkPins.length > 0;
  const actionSteps = [
    `Clones main of ${repo.name} into a temp folder on this machine.`,
    `Creates the branch update-to-${major} there.`,
    hasEmbeddingSdkPins
      ? `Sets every pin to ${major}: the Docker image to v1.${major}.x, and @metabase/embedding-sdk-react to ^0.${major}.0 in ${repo.embeddingSdkPins.join(", ")}.`
      : `Sets the Docker image to v1.${major}.x in ${repo.imagePins.join(", ")}.`,
    ...(hasEmbeddingSdkPins
      ? [
          "Updates the lockfile next to each package.json, with npm or yarn (no install scripts).",
        ]
      : []),
    "Shows the diff, and a warning for every file or pin that is not as expected.",
    `Asks again, then pushes update-to-${major} and opens its PR to main.`,
  ];
  return {
    description: [
      ...actionSteps.map((line, index) => `${index + 1}. ${line}`),
      "It never merges. After a no, the temp folder stays and GitHub does not change.",
    ],
    run: (interaction) => updateSampleRepo(interaction, repo, major, warnings),
  };
}

function openUpdatePrAction(
  repo: SampleRepo,
  updateBranch: string,
  major: number,
  warnings: string[],
): Action {
  return {
    description: [
      `Opens the PR from ${updateBranch} to main on ${repo.name}. It changes no file.`,
      `An earlier run pushed ${updateBranch}, but its PR did not open. Look at the branch first:`,
      `https://github.com/${repo.name}/compare/main...${updateBranch}`,
    ],
    run: async (interaction) => {
      if (!(await askToContinueDespiteWarnings(interaction, warnings))) {
        return "stopped";
      }
      await openUpdatePr(interaction, repo, updateBranch, major);
      return "done";
    },
  };
}

async function updateSampleRepo(
  interaction: Interaction,
  repo: SampleRepo,
  major: number,
  warnings: string[],
): Promise<ActionOutcome> {
  const updateBranch = `update-to-${major}`;
  const clone = await mkdtemp(
    path.join(tmpdir(), "embedding-sdk-release-clone-"),
  );
  interaction.print(`  Working in ${clone}`);
  await cloneMainInto(repo.name, clone);
  await $`git switch -c ${updateBranch}`.cwd(clone).quiet();

  // we search every tracked file, to find pins that the list does not have
  const pins = await findPinsInEveryTrackedFile(clone);
  const warningsBeforeTheChange = [
    ...warnings,
    ...comparePinsWithTheExpectedList(repo, pins, major),
    ...(await foldersWithBothLockfiles(clone, repo)),
  ];
  if (
    !(await askToContinueDespiteWarnings(interaction, warningsBeforeTheChange))
  ) {
    return cloneStaysIn(interaction, clone);
  }

  const pinsToRewrite = pins.filter((pin) => !isPinOnMajor(pin, major));
  for (const file of new Set(pinsToRewrite.map((pin) => pin.file))) {
    const text = await readFile(path.join(clone, file), "utf8");
    await writeFile(path.join(clone, file), rewritePinsInText(text, major));
  }

  // A lockfile changes when its package.json changed, or when it does not lock
  // a version in the range of its package.json. That includes a package.json
  // that the list does not have, after a "Continue anyway".
  const packageJsonsWithEmbeddingSdk = [
    ...new Set([
      ...repo.embeddingSdkPins,
      ...pins
        .filter((pin) => pin.kind === "embeddingSdk")
        .map((pin) => pin.file),
    ]),
  ];
  const lockfiles: string[] = [];
  for (const packageJson of packageJsonsWithEmbeddingSdk) {
    const isPackageJsonRewritten = pinsToRewrite.some(
      (pin) => pin.file === packageJson,
    );
    if (
      isPackageJsonRewritten ||
      !(await doesLockfileInCloneSatisfyItsPackageJson(clone, packageJson))
    ) {
      lockfiles.push(await updateLockfileNextTo(clone, packageJson));
    }
  }

  const changedFiles = await changedFilesInClone(clone);
  const expectedChangedFiles = new Set([
    ...pinsToRewrite.map((pin) => pin.file),
    ...lockfiles,
  ]);
  const warningsAfterTheChange = [
    ...changedFiles
      .filter((file) => !expectedChangedFiles.has(file))
      .map((file) => `${file} changed, and we did not expect it`),
    ...[...expectedChangedFiles]
      .filter((file) => !changedFiles.includes(file))
      .map((file) => `${file} did not change`),
  ];
  for (const packageJson of packageJsonsWithEmbeddingSdk) {
    if (!(await doesLockfileInCloneSatisfyItsPackageJson(clone, packageJson))) {
      warningsAfterTheChange.push(
        `the lockfile next to ${packageJson} does not lock a version in the range of ${packageJson}`,
      );
    }
  }

  await $`git --no-pager diff --stat`.cwd(clone);
  await $`git --no-pager diff -- . ${":(exclude)*package-lock.json"} ${":(exclude)*yarn.lock"}`.cwd(
    clone,
  );
  if (
    !(await askToContinueDespiteWarnings(interaction, warningsAfterTheChange))
  ) {
    return cloneStaysIn(interaction, clone);
  }
  if (
    !(await interaction.confirm(
      `Commit, push ${updateBranch} and open the PR on ${repo.name}?`,
    ))
  ) {
    return cloneStaysIn(interaction, clone);
  }

  await $`git add -- ${changedFiles}`.cwd(clone).quiet();
  await $`git commit -m ${updatePrTitle(repo, major)}`.cwd(clone).quiet();
  await pushNewBranch(repo.name, clone, updateBranch);
  await openUpdatePr(interaction, repo, updateBranch, major);
  return "done";
}

function cloneStaysIn(interaction: Interaction, clone: string): ActionOutcome {
  interaction.print(`  The clone stays in ${clone}`);
  return "stopped";
}

async function openUpdatePr(
  interaction: Interaction,
  repo: SampleRepo,
  updateBranch: string,
  major: number,
): Promise<void> {
  const changes = [`- \`metabase/metabase-enterprise:v1.${major}.x\``];
  if (repo.embeddingSdkPins.length > 0) {
    changes.push(`- \`@metabase/embedding-sdk-react@^0.${major}.0\``);
  }
  const productionWarning = repo.production
    ? [
        `⚠️ Merge this PR only after ${repo.production.metabaseUrl} runs Metabase ${major}.`,
        "",
        `Merging it deploys the ${repo.production.app} frontend to production, with Embedding SDK 0.${major}.`,
        "",
      ]
    : [];
  const url = await openPullRequest(repo.name, {
    base: "main",
    head: updateBranch,
    title: updatePrTitle(repo, major),
    body: [
      ...productionWarning,
      `Moves the sample to Metabase ${major}:`,
      "",
      ...changes,
    ].join("\n"),
  });
  interaction.print(`  Opened the PR. Check it: ${url}`);
}

function updatePrTitle(repo: SampleRepo, major: number): string {
  return repo.embeddingSdkPins.length > 0
    ? `Update to Metabase ${major} and Embedding SDK 0.${major}`
    : `Update to Metabase ${major}`;
}

// Questions about a branch on GitHub

// Every expected file has pins, all of them on <major>, and the lockfile next
// to each package.json locks a version in its range. It accepts what the
// update action accepts after a "Continue anyway": two pins in one file, or
// both lockfiles in one folder.
async function isBranchOnMajor(
  repo: SampleRepo,
  branch: string,
  major: number,
): Promise<boolean> {
  for (const expected of expectedPins(repo)) {
    const pins = (await pinsInFileOnBranch(repo, expected.file, branch)).filter(
      (pin) => pin.kind === expected.kind,
    );
    if (pins.length === 0 || !pins.every((pin) => isPinOnMajor(pin, major))) {
      return false;
    }
  }
  for (const packageJson of repo.embeddingSdkPins) {
    const pins = (await pinsInFileOnBranch(repo, packageJson, branch)).filter(
      (pin) => pin.kind === "embeddingSdk",
    );
    // with both lockfiles, the action updates package-lock.json, the first one
    const [lockfile] = await lockfilesNextToOnBranch(repo, packageJson, branch);
    if (
      !lockfile ||
      !isLockedVersionInEveryRange(
        lockedEmbeddingSdkVersion(lockfile.file, lockfile.text),
        pins,
      )
    ) {
      return false;
    }
  }
  return true;
}

// "0.65.0-beta.0" is not in "^0.65.0", and "0.65.1" is not in "^0.65.9"
function isLockedVersionInEveryRange(
  locked: string | null,
  embeddingSdkPins: Pin[],
): boolean {
  return (
    locked != null &&
    embeddingSdkPins.length > 0 &&
    embeddingSdkPins.every((pin) => semver.satisfies(locked, pin.value))
  );
}

// for example "docker-compose.yml v1.64.x, client/package.json ^0.64.0,
// client/package-lock.json 0.64.0"
async function describePinsOnBranch(
  repo: SampleRepo,
  branch: string,
): Promise<string> {
  const parts: string[] = [];
  for (const expected of expectedPins(repo)) {
    const pins = await pinsInFileOnBranch(repo, expected.file, branch);
    const values = pins
      .filter((pin) => pin.kind === expected.kind)
      .map((pin) => pin.value);
    parts.push(`${expected.file} ${values.join(" ") || "no pin"}`);
  }
  for (const packageJson of repo.embeddingSdkPins) {
    for (const lockfile of await lockfilesNextToOnBranch(
      repo,
      packageJson,
      branch,
    )) {
      const locked = lockedEmbeddingSdkVersion(lockfile.file, lockfile.text);
      parts.push(`${lockfile.file} ${locked ?? "no Embedding SDK"}`);
    }
  }
  return parts.join(", ");
}

async function pinsInFileOnBranch(
  repo: SampleRepo,
  file: string,
  branch: string,
): Promise<Pin[]> {
  const text = await readFileOnBranch(repo.name, file, branch);
  return text == null ? [] : findPinsInFile(file, text);
}

// package-lock.json and yarn.lock next to the package.json; we expect one
async function lockfilesNextToOnBranch(
  repo: SampleRepo,
  packageJson: string,
  branch: string,
): Promise<{ file: string; text: string }[]> {
  const lockfiles: { file: string; text: string }[] = [];
  for (const name of LOCKFILE_NAMES) {
    const file = path.join(path.dirname(packageJson), name);
    const text = await readFileOnBranch(repo.name, file, branch);
    if (text != null) {
      lockfiles.push({ file, text });
    }
  }
  return lockfiles;
}

// every PR from update-to-<major> to main, and the other open PRs that mention
// the major
async function updatePullRequestsOf(
  repo: SampleRepo,
  major: number,
): Promise<PullRequest[]> {
  const updateBranch = `update-to-${major}`;
  return [
    ...(await findPullRequestsFromBranch(repo.name, updateBranch, "main")),
    ...(await findOtherOpenPullRequestsThatMentionMajor(
      repo,
      updateBranch,
      major,
    )),
  ];
}

async function isEmbeddingSdkMajorOnNpm(major: number): Promise<boolean> {
  return (await npmVersionWithDistTag(`${major}-stable`)) !== undefined;
}

async function isNpmLatestOnMajor(major: number): Promise<boolean> {
  const npmLatest = await npmVersionWithDistTag("latest");
  return npmLatest !== undefined && embeddingSdkMajorOf(npmLatest) === major;
}

async function findOtherOpenPullRequestsThatMentionMajor(
  repo: SampleRepo,
  updateBranch: string,
  major: number,
): Promise<PullRequest[]> {
  // "65" alone, not inside another number: matches "v65" and "0.65", not "1650"
  const mentionsMajor = new RegExp(`(?<![0-9])${major}(?![0-9])`);
  const openPullRequests = await findOpenPullRequestsTo(repo.name, "main");
  return openPullRequests.filter(
    (pr) => pr.headRefName !== updateBranch && mentionsMajor.test(pr.title),
  );
}

// for example "v1.64.3.4" -> 64
function metabaseMajorOf(version: string): number {
  return Number(/^v1\.(\d+)/.exec(version)?.[1]);
}

// Questions about the clone

async function findPinsInEveryTrackedFile(clone: string): Promise<Pin[]> {
  const files = (await $`git ls-files -z`.cwd(clone).text())
    .split("\0")
    .filter(Boolean);
  const pins: Pin[] = [];
  for (const file of files) {
    if (LOCKFILE_NAMES.includes(path.basename(file))) {
      continue;
    }
    const content = await readFile(path.join(clone, file));
    // binary files have a zero byte
    if (content.includes(0)) {
      continue;
    }
    pins.push(...findPinsInFile(file, content.toString("utf8")));
  }
  return pins;
}

async function foldersWithBothLockfiles(
  clone: string,
  repo: SampleRepo,
): Promise<string[]> {
  return repo.embeddingSdkPins
    .filter((packageJson) =>
      LOCKFILE_NAMES.every((name) =>
        existsSync(path.join(clone, path.dirname(packageJson), name)),
      ),
    )
    .map(
      (packageJson) =>
        `${path.dirname(packageJson)} has both package-lock.json and yarn.lock`,
    );
}

async function doesLockfileInCloneSatisfyItsPackageJson(
  clone: string,
  packageJson: string,
): Promise<boolean> {
  const pins = findPinsInFile(
    packageJson,
    await readFile(path.join(clone, packageJson), "utf8"),
  ).filter((pin) => pin.kind === "embeddingSdk");
  for (const name of LOCKFILE_NAMES) {
    const file = path.join(path.dirname(packageJson), name);
    if (existsSync(path.join(clone, file))) {
      const text = await readFile(path.join(clone, file), "utf8");
      return isLockedVersionInEveryRange(
        lockedEmbeddingSdkVersion(file, text),
        pins,
      );
    }
  }
  return false;
}

// We update only the lockfile next to the package.json, with the package
// manager that wrote it, and we skip install scripts.
async function updateLockfileNextTo(
  clone: string,
  packageJson: string,
): Promise<string> {
  const folder = path.dirname(packageJson);
  const cwd = path.join(clone, folder);
  if (existsSync(path.join(cwd, "package-lock.json"))) {
    await updateLockfileIn(cwd, "npm");
    return path.join(folder, "package-lock.json");
  }
  if (existsSync(path.join(cwd, "yarn.lock"))) {
    const packageJsonContent: { packageManager?: string } = JSON.parse(
      await readFile(path.join(clone, packageJson), "utf8"),
    );
    // "yarn@1.22.22+sha512..." -> "yarn@1.22.22"
    const yarn = packageJsonContent.packageManager?.split("+")[0] ?? "yarn@1";
    if (!isYarnOne(yarn)) {
      throw new Error(`${packageJson} uses ${yarn}, and we only know Yarn 1`);
    }
    await updateLockfileIn(cwd, yarn);
    return path.join(folder, "yarn.lock");
  }
  throw new Error(`${folder} has no lockfile`);
}

function isYarnOne(
  packageManager: string,
): packageManager is `yarn@1${string}` {
  return packageManager.startsWith("yarn@1");
}

// with -z, git puts no quotes around a name with spaces, and it ends each
// entry with a NUL
async function changedFilesInClone(clone: string): Promise<string[]> {
  const status = await $`git status --porcelain -z --untracked-files=all`
    .cwd(clone)
    .text();
  return status
    .split("\0")
    .filter(Boolean)
    .map((entry) => entry.slice(3));
}

// Pins

type PinKind = "image" | "embeddingSdk";

type Pin = { file: string; kind: PinKind; value: string };

const LOCKFILE_NAMES = ["package-lock.json", "yarn.lock"];

// metabase/metabase-enterprise:v1.64.x, with an optional @sha256 digest
const IMAGE_PIN =
  /(metabase\/metabase(?:-enterprise)?:)(v1\.\d+[\w.-]*(?:@sha256:[0-9a-f]+)?)/g;
// "@metabase/embedding-sdk-react": "^0.64.0"
const EMBEDDING_SDK_PIN =
  /("@metabase\/embedding-sdk-react"\s*:\s*")([^"]*)(")/g;

function expectedPins(repo: SampleRepo): { file: string; kind: PinKind }[] {
  return [
    ...repo.imagePins.map((file) => ({ file, kind: "image" as const })),
    ...repo.embeddingSdkPins.map((file) => ({
      file,
      kind: "embeddingSdk" as const,
    })),
  ];
}

function findPinsInFile(file: string, text: string): Pin[] {
  const pins: Pin[] = [];
  for (const match of text.matchAll(IMAGE_PIN)) {
    pins.push({ file, kind: "image", value: match[2] });
  }
  // source files import the package too, so we read this pin only in package.json
  if (path.basename(file) === "package.json") {
    for (const match of text.matchAll(EMBEDDING_SDK_PIN)) {
      pins.push({ file, kind: "embeddingSdk", value: match[2] });
    }
  }
  return pins;
}

// A released version of <major>, with no prerelease and no digest:
// v1.65.x or v1.65.2 for the image, ^0.65.0 or ^0.65.1 for the Embedding SDK.
function isPinOnMajor(pin: Pin, major: number): boolean {
  const releasedVersionOfMajor =
    pin.kind === "image"
      ? new RegExp(`^v1\\.${major}(\\.(x|\\d+))+$`)
      : new RegExp(`^[\\^~]?0\\.${major}\\.\\d+$`);
  return releasedVersionOfMajor.test(pin.value);
}

function majorOfPin(pin: Pin): number | null {
  const major =
    pin.kind === "image"
      ? /^v1\.(\d+)/.exec(pin.value)
      : /^[\^~]?0\.(\d+)\./.exec(pin.value);
  return major ? Number(major[1]) : null;
}

// the value we write: v1.65.x and ^0.65.0
function pinValueForMajor(kind: PinKind, major: number): string {
  return kind === "image" ? `v1.${major}.x` : `^0.${major}.0`;
}

function rewritePinsInText(text: string, major: number): string {
  return text
    .replace(
      IMAGE_PIN,
      (_match, prefix: string) =>
        `${prefix}${pinValueForMajor("image", major)}`,
    )
    .replace(
      EMBEDDING_SDK_PIN,
      (_match, prefix: string, _value: string, suffix: string) =>
        `${prefix}${pinValueForMajor("embeddingSdk", major)}${suffix}`,
    );
}

function comparePinsWithTheExpectedList(
  repo: SampleRepo,
  pins: Pin[],
  major: number,
): string[] {
  const warnings: string[] = [];
  for (const expected of expectedPins(repo)) {
    const count = pins.filter(
      (pin) => pin.file === expected.file && pin.kind === expected.kind,
    ).length;
    if (count !== 1) {
      warnings.push(
        `${expected.file}: we expect 1 ${expected.kind} pin, and we found ${count}`,
      );
    }
  }
  for (const pin of pins) {
    const where = `${pin.file}: ${pin.kind} pin ${pin.value}`;
    const isExpected = expectedPins(repo).some(
      (expected) => expected.file === pin.file && expected.kind === pin.kind,
    );
    if (!isExpected) {
      warnings.push(`${where} is not in the expected list`);
    }
    const pinMajor = majorOfPin(pin);
    if (pinMajor !== major - 1 && pinMajor !== major) {
      warnings.push(`${where} is not on ${major - 1} or ${major}`);
    }
    if (pinMajor != null && !isPinOnMajor(pin, pinMajor)) {
      warnings.push(
        `${where} has a prerelease, a digest or an unknown format: we write ${pinValueForMajor(pin.kind, major)}`,
      );
    }
  }
  return warnings;
}

// "@metabase/embedding-sdk-react@^0.64.0":
//   version "0.64.0"
const YARN_LOCK_ENTRY =
  /^"?@metabase\/embedding-sdk-react@[^\n]*:\n\s+version "([^"]+)"/m;

function lockedEmbeddingSdkVersion(
  lockfile: string,
  text: string,
): string | null {
  if (path.basename(lockfile) === "package-lock.json") {
    const lock: { packages?: Record<string, { version?: string }> } =
      JSON.parse(text);
    return (
      lock.packages?.["node_modules/@metabase/embedding-sdk-react"]?.version ??
      null
    );
  }
  return YARN_LOCK_ENTRY.exec(text)?.[1] ?? null;
}
