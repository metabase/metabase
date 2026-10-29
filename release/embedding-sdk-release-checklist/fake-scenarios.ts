// The worlds that `--fake` starts from. Each one is a copy of a real moment,
// with small files that hold only what the script reads.
import { PACKAGE_TEMPLATE } from "./embedding-sdk-version-bumps";
import type { FakeWorld } from "./fake-external-calls";
import {
  MODULAR,
  NEXTJS,
  REACT,
  SHOPPY,
  type SampleRepo,
} from "./sample-repos";

export type FakeScenario = { about: string; world: () => FakeWorld };

// "today" is the scenario that --fake starts from when --scenario is missing
export function fakeScenariosFor(
  phase: string,
  major: number,
): Record<string, FakeScenario> {
  if (phase === "gold" && major === 65) {
    return GOLD_65_SCENARIOS;
  }
  if (phase === "beta" && major === 66) {
    return BETA_66_SCENARIOS;
  }
  return {};
}

export function fakeWorldFor(
  phase: string,
  major: number,
  scenario = "today",
): FakeWorld {
  const scenarios = fakeScenariosFor(phase, major);
  if (!(scenario in scenarios)) {
    throw new Error(
      `--fake has no scenario "${scenario}" for "${phase} ${major}". It has: ${Object.keys(scenarios).join(", ") || "none"}.`,
    );
  }
  return scenarios[scenario].world();
}

const GOLD_65_SCENARIOS: Record<string, FakeScenario> = {
  today: {
    about: "65 is gold and 0.65.1 is out (2026-10-28)",
    world: gold65AsOn20261028,
  },
  "beta-pr-open": {
    about:
      "gold day: release-x.65.x is 0.65.0-beta.1, and a beta.2 bump PR is still open",
    world: () => {
      const world = gold65AsOn20261028();
      changeTemplate(world, "release-x.65.x", {
        version: "0.65.0-beta.1",
        distTag: "65-beta",
        tagAsLatest: false,
      });
      world.branches["metabase/metabase@sdk-version-bump-0.65.0-beta.2"] = {
        ...world.branches["metabase/metabase@release-x.65.x"],
      };
      changeTemplate(world, "sdk-version-bump-0.65.0-beta.2", {
        version: "0.65.0-beta.2",
        distTag: "65-beta",
        tagAsLatest: false,
      });
      world.pullRequests = [
        {
          ...mergedBumpPr(84999, "release-x.65.x", "0.65.0-beta.2"),
          state: "OPEN",
        },
      ];
      world.workflowRuns = [];
      world.npmDistTags = {
        latest: "0.64.0",
        "64-stable": "0.64.0",
        "65-beta": "0.65.0-beta.1",
        "65-alpha": "0.65.0-alpha.0",
      };
      return world;
    },
  },
  "two-pins": {
    about: "the modular docker-compose.yml has two Metabase images",
    world: () => {
      const world = gold65AsOn20261028();
      world.branches[`${MODULAR.name}@main`]["docker-compose.yml"] +=
        "  metabase-2:\n    image: metabase/metabase-enterprise:v1.64.x\n";
      return world;
    },
  },
  "space-in-name": {
    about: 'modular pins Metabase in a file called "extra compose.yml" too',
    world: () => {
      const world = gold65AsOn20261028();
      world.branches[`${MODULAR.name}@main`]["extra compose.yml"] =
        "services:\n  extra:\n    image: metabase/metabase-enterprise:v1.64.x\n";
      return world;
    },
  },
  "beta-lockfile": {
    about: "react main pins 65, but its lockfile locks 0.65.0-beta.0",
    world: () => {
      const world = gold65AsOn20261028();
      world.branches[`${REACT.name}@main`] = sampleRepoFiles(
        REACT,
        65,
        "0.65.0-beta.0",
      );
      return world;
    },
  },
  "cron-failed": {
    about:
      "react main is on 65, 65-stable is missing, and the hourly workflow that creates it failed",
    world: () => {
      const world = gold65AsOn20261028();
      world.branches[`${REACT.name}@main`] = sampleRepoFiles(
        REACT,
        65,
        "0.65.1",
      );
      delete world.branches[`${REACT.name}@65-stable`];
      world.workflowRuns.push({
        repo: REACT.name,
        workflow: "create-version-branch.yml",
        branch: "64-stable",
        status: "completed",
        conclusion: "failure",
        displayTitle:
          "Check the Metabase SDK version and create a version branch",
        url: `https://github.com/${REACT.name}/actions/runs/301`,
        createdAt: "2026-11-02T11:00:00Z",
      });
      return world;
    },
  },
  "old-checklist": {
    about: "66 is already gold: npm latest is 0.66.0",
    world: () => {
      const world = gold65AsOn20261028();
      world.npmDistTags.latest = "0.66.0";
      return world;
    },
  },
};

const BETA_66_SCENARIOS: Record<string, FakeScenario> = {
  today: {
    about: "release-x.66.x is cut, after a correct preminor",
    world: beta66RightAfterTheCut,
  },
  "bump-failed": {
    about: "the last beta bump run on release-x.66.x failed",
    world: () => {
      const world = beta66RightAfterTheCut();
      world.workflowRuns.push({
        workflow: "sdk-version-bump-pr.yml",
        branch: "release-x.66.x",
        status: "completed",
        conclusion: "failure",
        displayTitle: "Bump Embedding SDK version (beta) on release-x.66.x",
        url: "https://github.com/metabase/metabase/actions/runs/111",
        createdAt: "2026-11-02T09:00:00Z",
      });
      return world;
    },
  },
  "release-skipped": {
    about:
      "the 0.66.0-beta.0 PR is merged, but its release run was skipped (no label)",
    world: betaZeroWithASkippedReleaseRun,
  },
  "release-by-hand-running": {
    about:
      "after the skipped run, a person started the release by hand, and it runs",
    world: () => {
      const world = betaZeroWithASkippedReleaseRun();
      world.workflowRuns.push(releaseRunByHand("in_progress", ""));
      return world;
    },
  },
  "release-by-hand-failed": {
    about:
      "after the skipped run, a person started the release by hand, and it failed",
    world: () => {
      const world = betaZeroWithASkippedReleaseRun();
      world.workflowRuns.push(releaseRunByHand("completed", "failure"));
      return world;
    },
  },
};

// 65 is gold and 0.65.1 is out. master still has the alpha of 65, and the
// sample repos still pin 64.
function gold65AsOn20261028(): FakeWorld {
  return {
    branches: {
      "metabase/metabase@master": metabaseFiles({
        version: "0.65.0-alpha.0",
        distTag: "65-alpha",
        tagAsLatest: false,
        isEmbeddingTeamMuted: false,
      }),
      "metabase/metabase@release-x.64.x": metabaseFiles({
        version: "0.64.0",
        distTag: "64-stable",
        tagAsLatest: true,
        isEmbeddingTeamMuted: true,
      }),
      "metabase/metabase@release-x.65.x": metabaseFiles({
        version: "0.65.1",
        distTag: "65-stable",
        tagAsLatest: true,
        isEmbeddingTeamMuted: true,
      }),
      ...sampleRepoBranches(NEXTJS, 64, "0.64.0", [
        "main",
        "64-stable",
        "65-stable",
      ]),
      ...sampleRepoBranches(REACT, 64, "0.64.0", [
        "main",
        "64-stable",
        "65-stable",
      ]),
      ...sampleRepoBranches(MODULAR, 64, "0.64.0", ["main"]),
      ...sampleRepoBranches(SHOPPY, 64, "0.64.0", ["main"]),
    },
    pullRequests: [
      // the preminor of 64 gold, which made master 0.65.0-alpha.0
      mergedBumpPr(84154, "master", "0.65.0-alpha.0"),
      mergedBumpPr(85621, "release-x.65.x", "0.65.0"),
      mergedBumpPr(85635, "release-x.65.x", "0.65.1"),
    ],
    workflowRuns: [
      releaseRun("0.65.0", "success", "2026-10-27T20:02:00Z"),
      releaseRun("0.65.1", "success", "2026-10-27T22:03:00Z"),
    ],
    defaultBranches: {
      [NEXTJS.name]: "64-stable",
      [REACT.name]: "64-stable",
    },
    workflowStates: {},
    npmDistTags: {
      latest: "0.65.1",
      "64-stable": "0.64.0",
      "65-stable": "0.65.1",
      "65-beta": "0.65.0-beta.1",
      "65-alpha": "0.65.0-alpha.0",
    },
    dockerImageTags: ["v1.64.x", "v1.65.x"],
    shoppyProductionVersion: "v1.64.3.4",
    latestMajorVersion: "65",
  };
}

// The preminor made master 0.66.0-alpha.0, and release-x.66.x was cut from
// it. The team is not muted yet.
function beta66RightAfterTheCut(): FakeWorld {
  return {
    branches: {
      "metabase/metabase@master": metabaseFiles({
        version: "0.66.0-alpha.0",
        distTag: "66-alpha",
        tagAsLatest: false,
        isEmbeddingTeamMuted: false,
      }),
      "metabase/metabase@release-x.65.x": metabaseFiles({
        version: "0.65.1",
        distTag: "65-stable",
        tagAsLatest: true,
        isEmbeddingTeamMuted: true,
      }),
      "metabase/metabase@release-x.66.x": metabaseFiles({
        version: "0.66.0-alpha.0",
        distTag: "66-alpha",
        tagAsLatest: false,
        isEmbeddingTeamMuted: false,
      }),
    },
    pullRequests: [],
    workflowRuns: [],
    defaultBranches: {},
    workflowStates: {},
    npmDistTags: {
      latest: "0.65.1",
      "65-stable": "0.65.1",
      "66-alpha": "0.66.0-alpha.0",
    },
    dockerImageTags: ["v1.65.x"],
    shoppyProductionVersion: "v1.65.1",
    latestMajorVersion: "65",
  };
}

function betaZeroWithASkippedReleaseRun(): FakeWorld {
  const world = beta66RightAfterTheCut();
  changeTemplate(world, "release-x.66.x", {
    version: "0.66.0-beta.0",
    distTag: "66-beta",
    tagAsLatest: false,
  });
  world.pullRequests.push(
    mergedBumpPr(85001, "release-x.66.x", "0.66.0-beta.0"),
  );
  world.workflowRuns.push(
    releaseRun("0.66.0-beta.0", "skipped", "2026-11-02T10:00:00Z"),
  );
  return world;
}

// `gh workflow run release-embedding-sdk.yml --ref release-x.66.x`
function releaseRunByHand(
  status: string,
  conclusion: string,
): FakeWorld["workflowRuns"][number] {
  return {
    workflow: "release-embedding-sdk.yml",
    branch: "release-x.66.x",
    status,
    conclusion,
    displayTitle: "Release SDK from release-x.66.x",
    url: "https://github.com/metabase/metabase/actions/runs/202",
    createdAt: "2026-11-02T10:05:00Z",
  };
}

function changeTemplate(
  world: FakeWorld,
  branch: string,
  {
    version,
    distTag,
    tagAsLatest,
  }: { version: string; distTag: string; tagAsLatest: boolean },
): void {
  const files = world.branches[`metabase/metabase@${branch}`];
  const template: Record<string, unknown> = JSON.parse(files[PACKAGE_TEMPLATE]);
  files[PACKAGE_TEMPLATE] = `${JSON.stringify(
    { ...template, version, sdkRelease: { distTag, tagAsLatest } },
    null,
    2,
  )}\n`;
}

function metabaseFiles({
  version,
  distTag,
  tagAsLatest,
  isEmbeddingTeamMuted,
}: {
  version: string;
  distTag: string;
  tagAsLatest: boolean;
  isEmbeddingTeamMuted: boolean;
}): Record<string, string> {
  const embeddingLines = [
    "frontend/src/metabase/embedding @metabase/embedding",
    "frontend/src/embedding-sdk-bundle @metabase/embedding",
    "enterprise/frontend/src/embedding-sdk-package @metabase/embedding",
  ];
  return {
    [PACKAGE_TEMPLATE]: `${JSON.stringify(
      {
        name: "@metabase/embedding-sdk-react",
        version,
        sdkRelease: { distTag, tagAsLatest },
      },
      null,
      2,
    )}\n`,
    ".github/CODEOWNERS": [
      "# @metabase/embedding",
      ...embeddingLines.map((line) =>
        isEmbeddingTeamMuted ? `# ${line}` : line,
      ),
      "frontend/src/metabase/querying @metabase/querying",
      "",
    ].join("\n"),
  };
}

// the same files on every branch in `branches`
function sampleRepoBranches(
  repo: SampleRepo,
  major: number,
  lockedVersion: string,
  branches: string[],
): Record<string, Record<string, string>> {
  return Object.fromEntries(
    branches.map((branch) => [
      `${repo.name}@${branch}`,
      sampleRepoFiles(repo, major, lockedVersion),
    ]),
  );
}

export function sampleRepoFiles(
  repo: SampleRepo,
  major: number,
  lockedVersion: string,
): Record<string, string> {
  const files: Record<string, string> = {
    "README.md": "# Sample app\n\nStart it with `docker compose up`.\n",
  };
  for (const file of repo.imagePins) {
    files[file] =
      `services:\n  metabase:\n    image: metabase/metabase-enterprise:v1.${major}.x\n`;
  }
  const usesYarn = repo === SHOPPY;
  for (const packageJson of repo.embeddingSdkPins) {
    const folder = packageJson.replace(/\/?package\.json$/, "");
    const prefix = folder ? `${folder}/` : "";
    const range = `^0.${major}.0`;
    files[packageJson] = `${JSON.stringify(
      {
        name: folder || "sample",
        dependencies: { "@metabase/embedding-sdk-react": range, react: "^19" },
        ...(usesYarn ? { packageManager: "yarn@1.22.22" } : {}),
      },
      null,
      2,
    )}\n`;
    if (usesYarn) {
      files[`${prefix}yarn.lock`] =
        `# yarn lockfile v1\n\n"@metabase/embedding-sdk-react@${range}":\n  version "${lockedVersion}"\n`;
    } else {
      files[`${prefix}package-lock.json`] = `${JSON.stringify(
        {
          lockfileVersion: 3,
          packages: {
            "": { dependencies: { "@metabase/embedding-sdk-react": range } },
            "node_modules/@metabase/embedding-sdk-react": {
              version: lockedVersion,
            },
          },
        },
        null,
        2,
      )}\n`;
    }
  }
  return files;
}

function mergedBumpPr(
  number: number,
  base: string,
  version: string,
): FakeWorld["pullRequests"][number] {
  return {
    repo: "metabase/metabase",
    base,
    number,
    state: "MERGED",
    url: `https://github.com/metabase/metabase/pull/${number}`,
    title: `chore(sdk): bump SDK version on ${base} to ${version}`,
    headRefName: `sdk-version-bump-${version}`,
    isDraft: false,
    isCrossRepository: false,
  };
}

function releaseRun(
  version: string,
  conclusion: string,
  createdAt: string,
): FakeWorld["workflowRuns"][number] {
  return {
    workflow: "release-embedding-sdk.yml",
    branch: `sdk-version-bump-${version}`,
    status: "completed",
    conclusion,
    displayTitle: `Release SDK ${version}`,
    url: `https://github.com/metabase/metabase/actions/runs/fake-${version}`,
    createdAt,
  };
}
