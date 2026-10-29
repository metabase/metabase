// The steps that bump the Embedding SDK version in package.template.json,
// through the "SDK Version Bump PR" workflow. Merging its PR publishes the
// version on npm (release-embedding-sdk.yml).
import semver from "semver";

import {
  type SdkReleaseType,
  computeNextSdkVersion,
  computeSdkDistTag,
  getSdkMajorVersion,
} from "../src/embedding-sdk-release-helpers";

import {
  type Action,
  type Link,
  type StepPullRequest,
  type StepResult,
  blocked,
  done,
  error,
  inProgress,
  manual,
  todo,
  withLinks,
} from "./checklist";
import {
  METABASE_REPO,
  type PullRequest,
  type WorkflowRun,
  dispatchWorkflow,
  doesBranchExist,
  findOpenPullRequestsTo,
  findPullRequestsFromBranch,
  findPullRequestsWithBranchPrefix,
  findWorkflowRuns,
  npmVersionWithDistTag,
  readFileOnBranch,
  readNpmDistTags,
} from "./external-calls";

export const PACKAGE_TEMPLATE =
  "enterprise/frontend/src/embedding-sdk-package/package.template.json";
export const BUMP_WORKFLOW = "sdk-version-bump-pr.yml";
const RELEASE_WORKFLOW = "release-embedding-sdk.yml";
const TAG_LATEST_WORKFLOW = "embedding-sdk-tag-latest.yml";

// An old checklist shows wrong states, and it can offer to move a sample repo
// back to an old major: we stop when npm latest is past the checklist.
export function isChecklistOver(
  phase: "beta" | "gold",
  major: number,
  npmLatest: string,
): boolean {
  const latestMajor = embeddingSdkMajorOf(npmLatest);
  return phase === "gold" ? latestMajor > major : latestMajor >= major;
}

// Beta: release-x.<major>.x goes from 0.<major>.0-alpha.N to 0.<major>.0-beta.0.
export async function checkBetaBump(major: number): Promise<StepResult> {
  return withLinks(
    await betaBumpState(major),
    await bumpLinksOf(`release-x.${major}.x`, major),
  );
}

async function betaBumpState(major: number): Promise<StepResult> {
  const releaseBranch = `release-x.${major}.x`;

  if (!(await doesBranchExist(METABASE_REPO, releaseBranch))) {
    return blocked(`the cut of ${releaseBranch}`);
  }
  const versionOnReleaseBranch =
    await embeddingSdkVersionOnBranch(releaseBranch);
  if (embeddingSdkMajorOf(versionOnReleaseBranch) !== major) {
    return manual(
      `${releaseBranch} has Embedding SDK ${versionOnReleaseBranch}, not 0.${major}.x: master's preminor bump was not merged before the cut.`,
      `Open a PR on ${releaseBranch} that sets the version to 0.${major}.0-alpha.0, then run this again: the beta bump then makes 0.${major}.0-beta.0.`,
    );
  }
  if (isVersionStable(versionOnReleaseBranch)) {
    return done(`${releaseBranch} is already ${versionOnReleaseBranch}`);
  }
  if (isVersionABeta(versionOnReleaseBranch)) {
    if (await isVersionOnNpm(versionOnReleaseBranch, `${major}-beta`)) {
      return done(
        `${versionOnReleaseBranch} is on npm ${major}-beta`,
        `for a later beta: ${bumpCommand(releaseBranch, "beta")}`,
      );
    }
    return explainWhyVersionIsNotOnNpm(
      releaseBranch,
      versionOnReleaseBranch,
      "beta",
    );
  }
  // the release branch is still on the alpha it got from master
  return offerBumpUnlessOneIsAlreadyOnItsWay(
    releaseBranch,
    "beta",
    versionOnReleaseBranch,
  );
}

// Gold: release-x.<major>.x goes from 0.<major>.0-beta.N to 0.<major>.0, and
// npm latest moves to it.
export async function checkPatchBump(major: number): Promise<StepResult> {
  return withLinks(
    await patchBumpState(major),
    await bumpLinksOf(`release-x.${major}.x`, major),
  );
}

async function patchBumpState(major: number): Promise<StepResult> {
  const releaseBranch = `release-x.${major}.x`;

  if (!(await doesBranchExist(METABASE_REPO, releaseBranch))) {
    return error(`${releaseBranch} does not exist`);
  }
  const versionOnReleaseBranch =
    await embeddingSdkVersionOnBranch(releaseBranch);
  if (embeddingSdkMajorOf(versionOnReleaseBranch) !== major) {
    return manual(
      `${releaseBranch} has Embedding SDK ${versionOnReleaseBranch}, not 0.${major}.x: fix it by hand first`,
    );
  }

  if (!isVersionStable(versionOnReleaseBranch)) {
    const nextVersion = nextVersionAfter(versionOnReleaseBranch, "patch");
    const openBumpPr = await findOpenBumpPr(releaseBranch);
    // the workflow decides tagAsLatest when it opens the PR, so a fix of the
    // variable needs a new PR
    if (
      openBumpPr?.headRefName === bumpBranchFor(nextVersion) &&
      !(await doesBranchTagNpmLatest(openBumpPr.headRefName))
    ) {
      return manual(
        `${openBumpPr.url} does not tag npm latest: the LATEST_MAJOR_VERSION variable was not ${major} when it opened.`,
        "Close it, delete its branch, ask the release manager to set the variable, then run this again.",
      );
    }
    return offerBumpUnlessOneIsAlreadyOnItsWay(
      releaseBranch,
      "patch",
      versionOnReleaseBranch,
    );
  }

  if (!(await isVersionOnNpm(versionOnReleaseBranch, `${major}-stable`))) {
    return explainWhyVersionIsNotOnNpm(
      releaseBranch,
      versionOnReleaseBranch,
      "patch",
    );
  }
  const npmLatest = await npmVersionWithDistTag("latest");
  if (npmLatest && semver.gte(npmLatest, versionOnReleaseBranch)) {
    return done(
      `${versionOnReleaseBranch} is on npm ${major}-stable, and npm latest is ${npmLatest}`,
      `for a later patch: ${bumpCommand(releaseBranch, "patch")}`,
    );
  }
  const tagLatestCommand = `gh workflow run ${TAG_LATEST_WORKFLOW} --repo ${METABASE_REPO} -f version=${versionOnReleaseBranch}`;
  if (await doesBranchTagNpmLatest(releaseBranch)) {
    return manual(
      `npm latest is ${npmLatest}, not ${versionOnReleaseBranch}: the "Tag npm release as latest" job of the release run failed.`,
      `Re-run that job, or run: ${tagLatestCommand}`,
    );
  }
  return manual(
    `npm latest is ${npmLatest}, and ${releaseBranch} does not tag latest: the LATEST_MAJOR_VERSION variable was not ${major} at the bump.`,
    `Ask the release manager to set it, then run: ${tagLatestCommand}`,
  );
}

// Gold: master goes from 0.<major>.0-alpha.N to 0.<major + 1>.0-alpha.0, so
// that release-x.<major + 1>.x gets the right version when it is cut.
export async function checkPreminorBump(major: number): Promise<StepResult> {
  return withLinks(
    await preminorBumpState(major),
    await bumpLinksOf("master", major + 1),
  );
}

async function preminorBumpState(major: number): Promise<StepResult> {
  const nextMajor = major + 1;
  const versionOnMaster = await embeddingSdkVersionOnBranch("master");
  const majorOnMaster = embeddingSdkMajorOf(versionOnMaster);

  if (majorOnMaster > nextMajor) {
    return done(`master is already on ${versionOnMaster}`);
  }
  if (majorOnMaster === nextMajor) {
    if (await isVersionOnNpm(versionOnMaster, `${nextMajor}-alpha`)) {
      return done(`${versionOnMaster} is on npm ${nextMajor}-alpha`);
    }
    return explainWhyVersionIsNotOnNpm("master", versionOnMaster, "alpha");
  }
  if (majorOnMaster < major) {
    return manual(
      `master is ${versionOnMaster}, behind ${major}: fix it by hand first`,
    );
  }

  // master is still on <major>, so it needs the preminor
  const nextReleaseBranch = `release-x.${nextMajor}.x`;
  if (await doesBranchExist(METABASE_REPO, nextReleaseBranch)) {
    return offerBumpUnlessOneIsAlreadyOnItsWay(
      "master",
      "preminor",
      versionOnMaster,
      `⚠️  ${nextReleaseBranch} is already cut with the version of ${major}: "beta ${nextMajor}" says how to fix it`,
    );
  }
  return offerBumpUnlessOneIsAlreadyOnItsWay(
    "master",
    "preminor",
    versionOnMaster,
    `Merge it before ${nextReleaseBranch} is cut: the cut copies master's version.`,
  );
}

// A bump that is not merged yet: it can be running, waiting for review, or
// not started. When nothing is on its way, we offer to dispatch it. A bump of
// another type that is on its way stops us too: two bump PRs on one branch
// change the same lines.
async function offerBumpUnlessOneIsAlreadyOnItsWay(
  branch: string,
  releaseType: SdkReleaseType,
  currentVersion: string,
  ...lines: string[]
): Promise<StepResult> {
  const bumpRuns = await findWorkflowRuns(METABASE_REPO, BUMP_WORKFLOW, branch);
  const runningBumpRun = bumpRuns.find(isRunStillRunning);
  if (runningBumpRun) {
    return inProgress(`the bump workflow is running: ${runningBumpRun.url}`);
  }
  const nextVersion = nextVersionAfter(currentVersion, releaseType);
  const openBumpPr = await findOpenBumpPr(branch);
  if (openBumpPr?.headRefName === bumpBranchFor(nextVersion)) {
    return manual(
      `review and merge ${openBumpPr.url} (${currentVersion} -> ${nextVersion})`,
      `before the merge, push a commit that formats the template (bunx oxfmt ${PACKAGE_TEMPLATE}): the workflow writes it in another format`,
    );
  }
  if (openBumpPr) {
    return manual(
      `${openBumpPr.url} (${openBumpPr.headRefName}) is open on ${branch}: merge or close it first.`,
      "Then run this again.",
    );
  }
  if (await doesBranchExist(METABASE_REPO, bumpBranchFor(nextVersion))) {
    return manual(
      `${bumpBranchFor(nextVersion)} exists with no open PR, and the bump workflow fails on it.`,
      "Delete the branch, then run this again.",
    );
  }
  // the run name is "Bump Embedding SDK version (<release type>) on <branch>"
  const lastBumpRunOfThisType = bumpRuns.find((run) =>
    run.displayTitle.includes(`(${releaseType})`),
  );
  const failedRunLines =
    lastBumpRunOfThisType && didRunFail(lastBumpRunOfThisType)
      ? [`the last bump run failed: ${lastBumpRunOfThisType.url}`]
      : [];
  return todo(
    dispatchBumpAction(branch, releaseType, currentVersion),
    `${branch} is ${currentVersion}`,
    ...failedRunLines,
    ...lines,
  );
}

// A version that is merged but not on npm: the release run is still running,
// it failed, or the version never had a release run.
async function explainWhyVersionIsNotOnNpm(
  branch: string,
  version: string,
  releaseTypeToPublishAgain: SdkReleaseType,
): Promise<StepResult> {
  const releaseRun = await findLatestReleaseRunOfVersion(branch, version);
  if (releaseRun && isRunStillRunning(releaseRun)) {
    return inProgress(
      `the release run is publishing ${version}: ${releaseRun.url}`,
    );
  }
  if (releaseRun && didRunFail(releaseRun)) {
    return manual(
      `the release run of ${version} failed: ${releaseRun.url}`,
      "Re-run its failed jobs.",
    );
  }
  if (releaseRun && wasRunSkipped(releaseRun)) {
    return manual(
      `the release run of ${version} was skipped: ${releaseRun.url}. Its PR had no sdk-release-trigger label.`,
      `Publish it by hand: gh workflow run ${RELEASE_WORKFLOW} --repo ${METABASE_REPO} --ref ${branch}`,
    );
  }
  if (!(await wasVersionMadeByAMergedBumpPr(branch, version))) {
    // like 0.65.0-beta.0 (#84141): set by hand, so no release run published it
    return offerBumpUnlessOneIsAlreadyOnItsWay(
      branch,
      releaseTypeToPublishAgain,
      version,
      `${version} was set by hand and is not on npm: the next bump publishes a new version`,
    );
  }
  if (releaseRun) {
    return inProgress(
      `the release run of ${version} passed, but npm does not show it yet: ${releaseRun.url}`,
    );
  }
  return inProgress(
    `${version} is merged, and its release run has not started yet`,
  );
}

// The action asks the branch again before it dispatches: someone can bump it
// while we wait for the "yes".
function dispatchBumpAction(
  branch: string,
  releaseType: SdkReleaseType,
  currentVersion: string,
): Action {
  const nextVersion = nextVersionAfter(currentVersion, releaseType);
  const distTag = computeSdkDistTag({ newVersion: nextVersion, releaseType });
  return {
    description: [
      `Runs the "SDK Version Bump PR" workflow on GitHub Actions, on ${branch}, with release_type=${releaseType}.`,
      `The workflow writes ${nextVersion} (now ${currentVersion}) and the npm dist-tag ${distTag} into ${PACKAGE_TEMPLATE},`,
      `pushes the branch ${bumpBranchFor(nextVersion)}, and opens a PR from it to ${branch}.`,
      "Nothing goes to npm yet: npm gets the version when someone merges that PR.",
    ],
    run: async (interaction) => {
      const versionNow = await embeddingSdkVersionOnBranch(branch);
      if (versionNow !== currentVersion) {
        interaction.print(
          `  Stopped: ${branch} is ${versionNow} now, not ${currentVersion}.`,
        );
        return "stopped";
      }
      const runsBefore = await findWorkflowRuns(
        METABASE_REPO,
        BUMP_WORKFLOW,
        branch,
      );
      await dispatchWorkflow(BUMP_WORKFLOW, branch, {
        release_type: releaseType,
      });
      const newRun = await interaction.waitFor(
        "Waiting for GitHub to list the new run...",
        waitForNewBumpRun(
          branch,
          runsBefore.map((run) => run.url),
        ),
      );
      interaction.print(
        newRun
          ? `  The workflow runs, and it opens the PR in about a minute. Check it: ${newRun.url}`
          : `  GitHub does not list the run yet. Check it: https://github.com/${METABASE_REPO}/actions/workflows/${BUMP_WORKFLOW}`,
      );
      return "done";
    },
  };
}

// GitHub lists a dispatched run after a few seconds. We wait for it, so that
// the next check sees the run and does not offer the same bump again.
async function waitForNewBumpRun(
  branch: string,
  urlsOfOlderRuns: string[],
): Promise<WorkflowRun | null> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const runs = await findWorkflowRuns(METABASE_REPO, BUMP_WORKFLOW, branch);
    const newRun = runs.find((run) => !urlsOfOlderRuns.includes(run.url));
    if (newRun) {
      return newRun;
    }
    await Bun.sleep(3000);
  }
  return null;
}

// Questions about versions

export async function embeddingSdkVersionOnBranch(
  branch: string,
): Promise<string> {
  const template = await readPackageTemplate(branch);
  return template.version;
}

// the bump workflow writes sdkRelease.tagAsLatest into the template
async function doesBranchTagNpmLatest(branch: string): Promise<boolean> {
  const template = await readPackageTemplate(branch);
  return template.sdkRelease?.tagAsLatest === true;
}

async function readPackageTemplate(
  branch: string,
): Promise<{ version: string; sdkRelease?: { tagAsLatest?: boolean } }> {
  const text = await readFileOnBranch(METABASE_REPO, PACKAGE_TEMPLATE, branch);
  if (text == null) {
    throw new Error(`${PACKAGE_TEMPLATE} is missing on ${branch}`);
  }
  return JSON.parse(text);
}

// the second number: 0.65.1 -> 65
export function embeddingSdkMajorOf(version: string): number {
  return Number(getSdkMajorVersion(version));
}

export function isVersionStable(version: string): boolean {
  return semver.prerelease(version) == null;
}

export function isVersionABeta(version: string): boolean {
  return semver.prerelease(version)?.[0] === "beta";
}

async function isVersionOnNpm(
  version: string,
  distTag: string,
): Promise<boolean> {
  return (await npmVersionWithDistTag(distTag)) === version;
}

function nextVersionAfter(
  currentVersion: string,
  releaseType: SdkReleaseType,
): string {
  return computeNextSdkVersion({
    currentVersion,
    releaseType,
    prereleaseId: "",
  });
}

// Questions about bump PRs and workflow runs

// the bump workflow pushes the branch sdk-version-bump-<new version>
function bumpBranchFor(version: string): string {
  return `sdk-version-bump-${version}`;
}

function bumpCommand(branch: string, releaseType: SdkReleaseType): string {
  return `gh workflow run ${BUMP_WORKFLOW} --repo ${METABASE_REPO} --ref ${branch} -f release_type=${releaseType}`;
}

// any open bump PR to the branch, whatever version it bumps to. We read the
// open PRs of the branch, not the search: the search can miss a PR that
// opened a few seconds ago.
async function findOpenBumpPr(branch: string): Promise<PullRequest | null> {
  const pullRequests = await findOpenPullRequestsTo(METABASE_REPO, branch);
  return (
    pullRequests.find(
      (pr) =>
        !pr.isCrossRepository && pr.headRefName.startsWith("sdk-version-bump-"),
    ) ?? null
  );
}

async function wasVersionMadeByAMergedBumpPr(
  branch: string,
  version: string,
): Promise<boolean> {
  const pullRequests = await findPullRequestsFromBranch(
    METABASE_REPO,
    bumpBranchFor(version),
    branch,
  );
  return pullRequests.some((pr) => pr.state === "MERGED");
}

// A merged bump PR starts release-embedding-sdk.yml, and GitHub files that run
// under the PR's head branch. A person can also start it by hand, and GitHub
// files that run under the branch it publishes from: we take that one when it
// started after the run of the PR.
async function findLatestReleaseRunOfVersion(
  branch: string,
  version: string,
): Promise<WorkflowRun | null> {
  const [runOfThePr] = await findWorkflowRuns(
    METABASE_REPO,
    RELEASE_WORKFLOW,
    bumpBranchFor(version),
  );
  if (!runOfThePr) {
    return null;
  }
  const [runByHand] = await findWorkflowRuns(
    METABASE_REPO,
    RELEASE_WORKFLOW,
    branch,
  );
  return runByHand && runByHand.createdAt > runOfThePr.createdAt
    ? runByHand
    : runOfThePr;
}

// The PRs and pages of a bump step: the open bump PRs to the branch, the last
// merged one (the one that made the version the branch has now), the last bump
// run, and the release run and npm page of that version. Until the bump of
// this release merges, the merged PR and the version can be from an earlier
// release: on master, before the preminor to 66 merges, they are the ones of
// the preminor to 65.
async function bumpLinksOf(
  branch: string,
  majorOfTheStep: number,
): Promise<{ pullRequests: StepPullRequest[]; links: Link[] }> {
  if (!(await doesBranchExist(METABASE_REPO, branch))) {
    return { pullRequests: [], links: [] };
  }
  const bumpPullRequests = await findPullRequestsWithBranchPrefix(
    METABASE_REPO,
    "sdk-version-bump-",
    branch,
  );
  const lastMerged = bumpPullRequests.find((pr) => pr.state === "MERGED");
  const pullRequests = [
    ...bumpPullRequests.filter((pr) => pr.state === "OPEN"),
    ...(lastMerged ? [lastMerged] : []),
  ].map((pr) => ({
    ...pr,
    isAboutAnEarlierRelease: !isVersionOfMajor(
      pr.headRefName.slice("sdk-version-bump-".length),
      majorOfTheStep,
    ),
  }));

  const links: Link[] = [];
  const version = await embeddingSdkVersionOnBranch(branch);
  const isVersionOfAnEarlierRelease = !isVersionOfMajor(
    version,
    majorOfTheStep,
  );
  const [lastBumpRun] = await findWorkflowRuns(
    METABASE_REPO,
    BUMP_WORKFLOW,
    branch,
  );
  if (lastBumpRun) {
    // the run that opened a PR of this release is the last one
    const hasAPullRequestOfThisRelease = pullRequests.some(
      (pr) => !pr.isAboutAnEarlierRelease,
    );
    links.push({
      label: `bump run on ${branch} (${lastBumpRun.createdAt.slice(0, 10)})`,
      url: lastBumpRun.url,
      isAboutAnEarlierRelease:
        isVersionOfAnEarlierRelease && !hasAPullRequestOfThisRelease,
    });
  }
  const releaseRun = await findLatestReleaseRunOfVersion(branch, version);
  if (releaseRun) {
    links.push({
      label: `npm release run of ${version}`,
      url: releaseRun.url,
      isAboutAnEarlierRelease: isVersionOfAnEarlierRelease,
    });
  }
  if (Object.values(await readNpmDistTags()).includes(version)) {
    links.push({
      label: `${version} on npm`,
      url: `https://www.npmjs.com/package/@metabase/embedding-sdk-react/v/${version}`,
      isAboutAnEarlierRelease: isVersionOfAnEarlierRelease,
    });
  }
  return { pullRequests, links };
}

function isVersionOfMajor(version: string, major: number): boolean {
  return (
    Boolean(semver.valid(version)) && embeddingSdkMajorOf(version) === major
  );
}

function isRunStillRunning(run: WorkflowRun): boolean {
  return run.status !== "completed";
}

export function didRunFail(run: WorkflowRun): boolean {
  return (
    run.status === "completed" &&
    ["failure", "cancelled", "timed_out", "startup_failure"].includes(
      run.conclusion,
    )
  );
}

function wasRunSkipped(run: WorkflowRun): boolean {
  return run.status === "completed" && run.conclusion === "skipped";
}
