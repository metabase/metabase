// The Embedding SDK release checklist, as a script. It reads the state from
// GitHub, npm and Docker Hub and shows every step as done, to do, blocked, in
// progress, manual or error. You choose a "to do" step, and it does it after a
// "yes". It only opens PRs (itself or through the SDK Version Bump PR
// workflow) and never merges. Running it again is always safe.
//
//   bun embedding-sdk-release-checklist.ts beta 66   after release-x.66.x is cut
//   bun embedding-sdk-release-checklist.ts gold 65   after 65 goes gold
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  type Step,
  note,
  step,
} from "./embedding-sdk-release-checklist/checklist";
import { checkCodeowners } from "./embedding-sdk-release-checklist/codeowners";
import {
  checkBetaBump,
  checkPatchBump,
  checkPreminorBump,
  embeddingSdkMajorOf,
  isChecklistOver,
} from "./embedding-sdk-release-checklist/embedding-sdk-version-bumps";
import {
  makeSureGhIsLoggedIn,
  npmVersionWithDistTag,
  replaceExternalCalls,
} from "./embedding-sdk-release-checklist/external-calls";
import {
  fakeExternalCalls,
  fakeHumanActions,
  fakeStoreInFile,
} from "./embedding-sdk-release-checklist/fake-external-calls";
import {
  fakeScenariosFor,
  fakeWorldFor,
} from "./embedding-sdk-release-checklist/fake-scenarios";
import {
  MODULAR,
  NEXTJS,
  REACT,
  SHOPPY,
  checkSampleRepo,
  checkShoppyProductionInstance,
  checkStableBranch,
} from "./embedding-sdk-release-checklist/sample-repos";
import {
  runInTerminal,
  showStatus,
} from "./embedding-sdk-release-checklist/tui";

const USAGE = `Usage: bun embedding-sdk-release-checklist.ts <beta|gold> <major> [--dry-run] [--fake[=<file>]] [--scenario=<name>] [--fresh]
  --dry-run          show the status once, and do nothing
  --fake             fake GitHub, npm, Docker Hub and Shoppy with a JSON file, and touch nothing.
                     The first run creates the file from a scenario; the next runs go on from it.
  --fake=<file>      the same, with your own file
  --scenario=<name>  the fake scenario to start from (it implies --fake); a wrong name lists them
  --fresh            start the fake file again from its scenario`;

const { phase, major, dryRun, fakeStateFile, scenario, isFresh } = parseArgs(
  process.argv.slice(2),
);
const releaseBranch = `release-x.${major}.x`;

let fakeMode = null;
if (fakeStateFile) {
  const scenarios = fakeScenariosFor(phase, major);
  if (!(scenario in scenarios)) {
    console.error(
      `--fake has no scenario "${scenario}" for "${phase} ${major}". It has: ${Object.keys(scenarios).join(", ") || "none"}.`,
    );
    process.exit(1);
  }
  if (isFresh) {
    rmSync(fakeStateFile, { force: true });
  }
  const store = fakeStoreInFile(fakeStateFile, () =>
    fakeWorldFor(phase, major, scenario),
  );
  replaceExternalCalls(fakeExternalCalls(store));
  fakeMode = {
    stateFile: fakeStateFile,
    scenario: `${scenario}: ${scenarios[scenario].about}`,
    humanActions: () => fakeHumanActions(store),
  };
} else {
  await makeSureGhIsLoggedIn();
}

const npmLatest = await npmVersionWithDistTag("latest");
if (npmLatest && isChecklistOver(phase, major, npmLatest)) {
  const latestMajor = embeddingSdkMajorOf(npmLatest);
  console.error(
    `npm latest is ${npmLatest}, so the "${phase} ${major}" checklist is over. Run "gold ${latestMajor}" or "beta ${latestMajor + 1}".`,
  );
  process.exit(1);
}

const nextMajor = major + 1;

let steps: Step[];
if (phase === "beta") {
  steps = [
    step(
      `Bump ${releaseBranch} to its first beta (0.${major}.0-beta.0)`,
      `When ${releaseBranch} is cut, it has the Embedding SDK version of master, 0.${major}.0-alpha.N. The beta bump changes it to 0.${major}.0-beta.0 in package.template.json. Merging its PR publishes that version on npm under ${major}-beta.`,
      () => checkBetaBump(major),
    ),
    step(
      "Mute @metabase/embedding in CODEOWNERS, in the first beta PR",
      `On a release branch, a bot opens backport PRs that it already approved, and CODEOWNERS asks our team to review each one. We comment out our lines in .github/CODEOWNERS once per release branch, with a commit in the first beta PR of ${releaseBranch}.`,
      () => checkCodeowners(major),
    ),
    note(
      "Update the Embedding SDK package CHANGELOG only for breaking or important changes in the package (not the bundle)",
    ),
  ];
} else {
  steps = [
    step(
      `Bump ${releaseBranch} to its stable version (0.${major}.0)`,
      `At gold, ${releaseBranch} goes from its last beta to 0.${major}.0. Merging the PR publishes it on npm under ${major}-stable, and moves npm latest to it. Later patches (0.${major}.1 and on) use the same bump.`,
      () => checkPatchBump(major),
    ),
    step(
      `Bump master to the first alpha of ${nextMajor} (preminor)`,
      `master goes from 0.${major}.0-alpha.N to 0.${nextMajor}.0-alpha.0. Merge it before release-x.${nextMajor}.x is cut: the cut copies the version of master, and the beta bump of ${nextMajor} keeps its major.`,
      () => checkPreminorBump(major),
    ),
    step(
      `nextjs: update main to Metabase ${major} and Embedding SDK 0.${major}`,
      `The Next.js sample (app router and pages router) pins the Metabase Docker image and @metabase/embedding-sdk-react. A PR on main moves both to ${major}, with the lockfiles.`,
      () => checkSampleRepo(NEXTJS, major),
    ),
    step(
      `react: update main to Metabase ${major} and Embedding SDK 0.${major}`,
      `The Node.js + React sample pins the Metabase Docker image (docker-compose.yml) and @metabase/embedding-sdk-react (client/package.json). A PR on main moves both to ${major}, with the lockfile.`,
      () => checkSampleRepo(REACT, major),
    ),
    step(
      `modular: update main to Metabase ${major}`,
      `The modular embedding sample loads embed.js from the Metabase instance, so it pins only the Docker image. A PR on main moves it to v1.${major}.x.`,
      () => checkSampleRepo(MODULAR, major),
    ),
    step(
      `shoppy: upgrade the production instance to Metabase ${major}`,
      `Shoppy production (shoppy.metabaseapp.com) runs on a Metabase Cloud instance. Merging the Shoppy PR deploys Embedding SDK 0.${major} there, so the instance must run ${major} first. A person upgrades it on Cloud: the script cannot.`,
      () => checkShoppyProductionInstance(major),
    ),
    step(
      `shoppy: update main to Metabase ${major} and Embedding SDK 0.${major}`,
      `Shoppy pins the Metabase Docker image (local runs and E2E) and @metabase/embedding-sdk-react (yarn). A PR on main moves both to ${major}. Its merge deploys production.`,
      () => checkSampleRepo(SHOPPY, major),
    ),
    step(
      `nextjs: move ${major}-stable to main and make it the default branch`,
      `An hourly workflow of the repo creates ${major}-stable from main when npm latest moves to ${major}. After the update PR merges, ${major}-stable must contain main and become the default branch, so people who open the repo get ${major}. A person does it: the step prints the commands.`,
      () => checkStableBranch(NEXTJS, major),
    ),
    step(
      `react: move ${major}-stable to main and make it the default branch`,
      `An hourly workflow of the repo creates ${major}-stable from main when npm latest moves to ${major}. After the update PR merges, ${major}-stable must contain main and become the default branch, so people who open the repo get ${major}. A person does it: the step prints the commands.`,
      () => checkStableBranch(REACT, major),
    ),
  ];
}

if (dryRun) {
  await showStatus(steps, fakeMode);
} else {
  await runInTerminal(steps, fakeMode);
}

function parseArgs(argv: string[]) {
  const flags = argv.filter((arg) => arg.startsWith("--"));
  const [phase, majorText, ...rest] = argv.filter(
    (arg) => !arg.startsWith("--"),
  );
  const major = Number(majorText);
  const hasOnlyKnownFlags = flags.every(
    (flag) =>
      flag === "--dry-run" ||
      flag === "--fresh" ||
      flag === "--fake" ||
      flag.startsWith("--fake=") ||
      flag.startsWith("--scenario="),
  );
  const scenarioFlag = flags.find((flag) => flag.startsWith("--scenario="));
  const scenario = scenarioFlag?.slice("--scenario=".length) ?? "today";
  // without a file, the state stays in the temp folder: one file per phase,
  // major and scenario
  const fakeFlag = flags.find((flag) => flag.startsWith("--fake"));
  const defaultFakeStateFile = path.join(
    tmpdir(),
    scenarioFlag
      ? `embedding-sdk-release-fake-${phase}-${major}-${scenario}.json`
      : `embedding-sdk-release-fake-${phase}-${major}.json`,
  );
  const fakeStateFile =
    fakeFlag && fakeFlag !== "--fake"
      ? path.resolve(fakeFlag.slice("--fake=".length))
      : fakeFlag || scenarioFlag
        ? defaultFakeStateFile
        : null;

  if (
    !isPhase(phase) ||
    !Number.isInteger(major) ||
    rest.length > 0 ||
    !hasOnlyKnownFlags
  ) {
    console.error(USAGE);
    process.exit(1);
  }

  return {
    phase,
    major,
    dryRun: flags.includes("--dry-run"),
    fakeStateFile,
    scenario,
    isFresh: flags.includes("--fresh"),
  };
}

function isPhase(value: string | undefined): value is "beta" | "gold" {
  return value === "beta" || value === "gold";
}
