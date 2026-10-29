import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from "bun:test";
// The checks and actions of the checklist, on the fake world. Run with:
//   bun test ./embedding-sdk-release-checklist
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { $, stripANSI } from "bun";

import {
  type Interaction,
  type StepResult,
  checkWithoutThrowing,
} from "./checklist";
import { checkCodeowners } from "./codeowners";
import {
  BUMP_WORKFLOW,
  PACKAGE_TEMPLATE,
  checkBetaBump,
  checkPatchBump,
  checkPreminorBump,
  isChecklistOver,
} from "./embedding-sdk-version-bumps";
import {
  forgetNpmDistTags,
  realExternalCalls,
  replaceExternalCalls,
} from "./external-calls";
import {
  type FakeStore,
  type FakeWorld,
  fakeExternalCalls,
  fakeHumanActions,
  fakeStoreInMemory,
} from "./fake-external-calls";
import {
  fakeScenariosFor,
  fakeWorldFor,
  sampleRepoFiles,
} from "./fake-scenarios";
import {
  MODULAR,
  NEXTJS,
  REACT,
  SHOPPY,
  type SampleRepo,
  checkDefaultBranch,
  checkSampleRepo,
  checkShoppyProductionInstance,
  checkStableBranchFastForward,
} from "./sample-repos";
import { highlight, linkSectionsOf } from "./tui";

const METABASE = "metabase/metabase";
const ENTRY = path.join(
  import.meta.dir,
  "..",
  "embedding-sdk-release-checklist.ts",
);

// the update actions leave their clones in the temp folder: we give them one
// that we delete at the end
const realTempFolder = process.env.TMPDIR;
let testTempFolder = "";
beforeAll(() => {
  testTempFolder = mkdtempSync(
    path.join(tmpdir(), "embedding-sdk-release-checklist-test-"),
  );
  process.env.TMPDIR = testTempFolder;
});
afterAll(() => {
  process.env.TMPDIR = realTempFolder;
  rmSync(testTempFolder, { recursive: true, force: true });
});

// the fake says what it does; the tests do not need that
let consoleLog: ReturnType<typeof spyOn>;
beforeEach(() => {
  consoleLog = spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  consoleLog.mockRestore();
});

// A scenario, changed by `edit`, behind every external call.
function fakeWorld(
  phase: "gold" | "beta",
  major: number,
  edit: (world: FakeWorld) => void = () => {},
): FakeStore {
  const world = fakeWorldFor(phase, major);
  edit(world);
  const store = fakeStoreInMemory(world);
  replaceExternalCalls(fakeExternalCalls(store));
  return store;
}

// After a change of the world, the next check is a new check round, as in the
// TUI: it reads npm again.
function editWorld(store: FakeStore, edit: (world: FakeWorld) => void): void {
  const world = store.load();
  edit(world);
  store.save(world);
  forgetNpmDistTags();
}

function setEmbeddingSdkVersion(
  world: FakeWorld,
  branch: string,
  version: string,
  tagAsLatest = false,
): void {
  world.branches[`${METABASE}@${branch}`][PACKAGE_TEMPLATE] = JSON.stringify({
    version,
    sdkRelease: { tagAsLatest },
  });
}

function setSampleRepoBranch(
  world: FakeWorld,
  repo: SampleRepo,
  branch: string,
  files: Record<string, string>,
): void {
  world.branches[`${repo.name}@${branch}`] = files;
}

function addPullRequest(
  world: FakeWorld,
  pullRequest: {
    repo: string;
    base: string;
    head: string;
    state: "OPEN" | "CLOSED" | "MERGED";
    title?: string;
  },
): void {
  const number = 1000 + world.pullRequests.length;
  world.pullRequests.push({
    repo: pullRequest.repo,
    base: pullRequest.base,
    number,
    state: pullRequest.state,
    url: `https://github.com/${pullRequest.repo}/pull/${number}`,
    title: pullRequest.title ?? `PR from ${pullRequest.head}`,
    headRefName: pullRequest.head,
    isDraft: false,
    isCrossRepository: false,
  });
}

// says yes to every question, except the ones in `noTo`
function person({ noTo = [] }: { noTo?: string[] } = {}) {
  const printed: string[] = [];
  const interaction: Interaction = {
    confirm: async (question) => !noTo.includes(question),
    print: (line) => {
      printed.push(line);
    },
    waitFor: (_message, work) => work,
  };
  return { interaction, printed };
}

// does the action of a person (merge, fast-forward...) whose label has `part`
function doAsAPerson(store: FakeStore, part: string): void {
  const action = fakeHumanActions(store).find((action) =>
    action.label.includes(part),
  );
  if (!action) {
    throw new Error(`no action of a person with "${part}"`);
  }
  action.run();
  forgetNpmDistTags();
}

async function runTheAction(
  result: StepResult,
  noTo: string[] = [],
  interaction = person({ noTo }),
) {
  if (!result.action) {
    throw new Error(`the step is ${result.state}, it has no action`);
  }
  const outcome = await result.action.run(interaction.interaction);
  forgetNpmDistTags();
  return { outcome, printed: interaction.printed };
}

const linesOf = (result: StepResult) => result.lines.join("\n");

describe("gold 65 as on 2026-10-28", () => {
  test("the patch bump is done, and it shows the PR that made 0.65.1", async () => {
    fakeWorld("gold", 65);
    const result = await checkPatchBump(65);
    expect(result.state).toBe("done");
    expect(result.pullRequests?.map((pr) => pr.url)).toEqual([
      "https://github.com/metabase/metabase/pull/85635",
    ]);
  });

  test("the preminor bump is to do", async () => {
    fakeWorld("gold", 65);
    const result = await checkPreminorBump(65);
    expect(result.state).toBe("todo");
    expect(result.action?.description.join("\n")).toContain("0.66.0-alpha.0");
  });

  test("every sample repo is to do", async () => {
    fakeWorld("gold", 65);
    for (const repo of [NEXTJS, REACT, MODULAR, SHOPPY]) {
      expect((await checkSampleRepo(repo, 65)).state).toBe("todo");
    }
  });

  test("the stable branches are blocked by the update PRs, and the default branches by the fast-forward", async () => {
    fakeWorld("gold", 65);
    const fastForward = await checkStableBranchFastForward(NEXTJS, 65);
    expect(fastForward.state).toBe("blocked");
    expect(linesOf(fastForward)).toContain("blocked by the update PR");
    const defaultBranch = await checkDefaultBranch(NEXTJS, 65);
    expect(defaultBranch.state).toBe("blocked");
    expect(linesOf(defaultBranch)).toContain(
      "blocked by the fast-forward of 65-stable to main",
    );
  });
});

describe("preminor bump on master", () => {
  test("the dispatch opens the bump PR, a person merges it, and npm gets the alpha", async () => {
    const store = fakeWorld("gold", 65);
    await runTheAction(await checkPreminorBump(65));

    const afterTheDispatch = await checkPreminorBump(65);
    expect(afterTheDispatch.state).toBe("manual");
    expect(linesOf(afterTheDispatch)).toContain("review and merge");
    expect(linesOf(afterTheDispatch)).toContain("oxfmt");
    expect(
      afterTheDispatch.pullRequests?.some((pr) => pr.state === "OPEN"),
    ).toBe(true);

    doAsAPerson(store, "merge");
    const afterTheMerge = await checkPreminorBump(65);
    expect(afterTheMerge.state).toBe("done");
    expect(linesOf(afterTheMerge)).toContain(
      "0.66.0-alpha.0 is on npm 66-alpha",
    );
  });

  test("it does not dispatch when master changed while we asked", async () => {
    const store = fakeWorld("gold", 65);
    const result = await checkPreminorBump(65);
    editWorld(store, (world) =>
      setEmbeddingSdkVersion(world, "master", "0.66.0-alpha.0"),
    );

    const { outcome } = await runTheAction(result);
    expect(outcome).toBe("stopped");
    expect(store.load().pullRequests.some((pr) => pr.state === "OPEN")).toBe(
      false,
    );
  });

  test("it still offers the preminor when release-x.66.x is already cut", async () => {
    fakeWorld("gold", 65, (world) => {
      world.branches[`${METABASE}@release-x.66.x`] = {
        ...world.branches[`${METABASE}@master`],
      };
    });
    const result = await checkPreminorBump(65);
    expect(result.state).toBe("todo");
    expect(linesOf(result)).toContain("release-x.66.x is already cut");
  });

  test("it is done when master is already past 66", async () => {
    fakeWorld("gold", 65, (world) =>
      setEmbeddingSdkVersion(world, "master", "0.67.0-alpha.0"),
    );
    expect((await checkPreminorBump(65)).state).toBe("done");
  });
});

describe("patch bump on release-x.65.x", () => {
  test("npm latest still on 0.65.0 while the template tags latest: re-run the tag-latest job", async () => {
    fakeWorld("gold", 65, (world) => {
      world.npmDistTags.latest = "0.65.0";
    });
    const result = await checkPatchBump(65);
    expect(result.state).toBe("manual");
    expect(linesOf(result)).toContain("embedding-sdk-tag-latest.yml");
    expect(linesOf(result)).toContain("version=0.65.1");
    expect(linesOf(result)).not.toContain("LATEST_MAJOR_VERSION");
  });

  test("npm latest on 64 and the template does not tag latest: the variable was wrong", async () => {
    fakeWorld("gold", 65, (world) => {
      world.npmDistTags.latest = "0.64.0";
      setEmbeddingSdkVersion(world, "release-x.65.x", "0.65.1", false);
    });
    const result = await checkPatchBump(65);
    expect(result.state).toBe("manual");
    expect(linesOf(result)).toContain("LATEST_MAJOR_VERSION");
  });

  test("a bump PR opened while LATEST_MAJOR_VERSION was 64: close it and dispatch again", async () => {
    fakeWorld("gold", 65, (world) => {
      setEmbeddingSdkVersion(world, "release-x.65.x", "0.65.0-beta.1");
      world.latestMajorVersion = "64";
    });
    await runTheAction(await checkPatchBump(65));
    const result = await checkPatchBump(65);
    expect(result.state).toBe("manual");
    expect(linesOf(result)).toContain("does not tag npm latest");
  });
});

describe("beta bump on release-x.66.x", () => {
  test("it is blocked before the cut", async () => {
    fakeWorld("beta", 66, (world) => {
      delete world.branches[`${METABASE}@release-x.66.x`];
    });
    const result = await checkBetaBump(66);
    expect(result.state).toBe("blocked");
    expect(linesOf(result)).toContain("blocked by the cut of release-x.66.x");
  });

  test("a branch cut with the version of 65 needs a person, who resets it to the alpha of 66", async () => {
    fakeWorld("beta", 66, (world) =>
      setEmbeddingSdkVersion(world, "release-x.66.x", "0.65.0-alpha.3"),
    );
    const result = await checkBetaBump(66);
    expect(result.state).toBe("manual");
    expect(linesOf(result)).toContain("0.66.0-alpha.0");
  });

  test("the whole first beta: dispatch, mute CODEOWNERS on its PR, merge", async () => {
    const store = fakeWorld("beta", 66);
    expect((await checkCodeowners(66)).state).toBe("blocked");

    await runTheAction(await checkBetaBump(66));
    expect((await checkBetaBump(66)).state).toBe("manual");

    const codeownersBeforeTheCommit = await checkCodeowners(66);
    expect(codeownersBeforeTheCommit.state).toBe("todo");
    await runTheAction(codeownersBeforeTheCommit);
    expect((await checkCodeowners(66)).state).toBe("done");

    doAsAPerson(store, "merge");
    const beta = await checkBetaBump(66);
    expect(beta.state).toBe("done");
    expect(linesOf(beta)).toContain("0.66.0-beta.0 is on npm 66-beta");
    expect(linesOf(await checkCodeowners(66))).toContain(
      "release-x.66.x has no active @metabase/embedding line",
    );
  });

  test("a beta set by hand that npm never got: the next beta bump publishes", async () => {
    fakeWorld("beta", 66, (world) =>
      setEmbeddingSdkVersion(world, "release-x.66.x", "0.66.0-beta.0"),
    );
    const result = await checkBetaBump(66);
    expect(result.state).toBe("todo");
    expect(linesOf(result)).toContain("set by hand");
    expect(result.action?.description.join("\n")).toContain("0.66.0-beta.1");
  });

  describe("a merged beta that npm does not have yet", () => {
    const mergedBeta = (world: FakeWorld) => {
      setEmbeddingSdkVersion(world, "release-x.66.x", "0.66.0-beta.0");
      addPullRequest(world, {
        repo: METABASE,
        base: "release-x.66.x",
        head: "sdk-version-bump-0.66.0-beta.0",
        state: "MERGED",
      });
    };
    const releaseRun = (status: string, conclusion: string) => ({
      workflow: "release-embedding-sdk.yml",
      branch: "sdk-version-bump-0.66.0-beta.0",
      status,
      conclusion,
      displayTitle: "Release SDK",
      url: "https://github.com/metabase/metabase/actions/runs/7",
    });

    test("no release run yet: in progress", async () => {
      fakeWorld("beta", 66, mergedBeta);
      const result = await checkBetaBump(66);
      expect(result.state).toBe("inProgress");
      expect(linesOf(result)).toContain("has not started yet");
    });

    test("the release run is running: in progress", async () => {
      fakeWorld("beta", 66, (world) => {
        mergedBeta(world);
        world.workflowRuns.push(releaseRun("in_progress", ""));
      });
      expect((await checkBetaBump(66)).state).toBe("inProgress");
    });

    test("the release run failed: a person re-runs it, and the step links it", async () => {
      fakeWorld("beta", 66, (world) => {
        mergedBeta(world);
        world.workflowRuns.push(releaseRun("completed", "failure"));
      });
      const result = await checkBetaBump(66);
      expect(result.state).toBe("manual");
      expect(linesOf(result)).toContain(
        "https://github.com/metabase/metabase/actions/runs/7",
      );
    });

    test("the release run was skipped: a person publishes by hand", async () => {
      fakeWorld("beta", 66, (world) => {
        mergedBeta(world);
        world.workflowRuns.push(releaseRun("completed", "skipped"));
      });
      const result = await checkBetaBump(66);
      expect(result.state).toBe("manual");
      expect(linesOf(result)).toContain("was skipped");
    });

    // a person starts it with `gh workflow run ... --ref release-x.66.x`, and
    // GitHub files that run under release-x.66.x
    const releaseRunByHand = {
      workflow: "release-embedding-sdk.yml",
      branch: "release-x.66.x",
      status: "in_progress",
      conclusion: "",
      displayTitle: "Release SDK from release-x.66.x",
      url: "https://github.com/metabase/metabase/actions/runs/9",
      createdAt: "2026-11-01T10:05:00Z",
    };

    test("skipped, then a person publishes by hand: in progress, then failed if that run fails", async () => {
      const store = fakeWorld("beta", 66, (world) => {
        mergedBeta(world);
        world.workflowRuns.push(
          {
            ...releaseRun("completed", "skipped"),
            createdAt: "2026-11-01T10:00:00Z",
          },
          releaseRunByHand,
        );
      });
      const running = await checkBetaBump(66);
      expect(running.state).toBe("inProgress");
      expect(linesOf(running)).toContain(releaseRunByHand.url);

      editWorld(store, (world) => {
        for (const run of world.workflowRuns) {
          if (run.url === releaseRunByHand.url) {
            run.status = "completed";
            run.conclusion = "failure";
          }
        }
      });
      const failed = await checkBetaBump(66);
      expect(failed.state).toBe("manual");
      expect(linesOf(failed)).toContain(`failed: ${releaseRunByHand.url}`);
    });

    test("a run by hand from before the merge does not hide the run of the PR", async () => {
      fakeWorld("beta", 66, (world) => {
        mergedBeta(world);
        world.workflowRuns.push(
          { ...releaseRunByHand, createdAt: "2026-10-01T10:00:00Z" },
          {
            ...releaseRun("completed", "skipped"),
            createdAt: "2026-11-01T10:00:00Z",
          },
        );
      });
      expect(linesOf(await checkBetaBump(66))).toContain("was skipped");
    });
  });

  test("a failed bump run shows its link, and the bump is still to do", async () => {
    fakeWorld("beta", 66, (world) => {
      world.workflowRuns.push({
        workflow: BUMP_WORKFLOW,
        branch: "release-x.66.x",
        status: "completed",
        conclusion: "failure",
        displayTitle: "Bump Embedding SDK version (beta) on release-x.66.x",
        url: "https://github.com/metabase/metabase/actions/runs/10",
      });
    });
    const result = await checkBetaBump(66);
    expect(result.state).toBe("todo");
    expect(linesOf(result)).toContain(
      "the last bump run failed: https://github.com/metabase/metabase/actions/runs/10",
    );
  });

  test("after the dispatch, the action waits until GitHub lists the run, and links it", async () => {
    fakeWorld("beta", 66);
    const messages: string[] = [];
    const { interaction, printed } = person();
    await runTheAction(await checkBetaBump(66), [], {
      interaction: {
        ...interaction,
        waitFor: (message, work) => {
          messages.push(message);
          return work;
        },
      },
      printed,
    });
    expect(messages).toEqual(["Waiting for GitHub to list the new run..."]);
    expect(printed.join("\n")).toContain(
      "Check it: https://github.com/metabase/metabase/actions/runs/fake-bump-0.66.0-beta.0",
    );
  });

  test("a bump workflow that still runs: in progress", async () => {
    fakeWorld("beta", 66, (world) => {
      world.workflowRuns.push({
        workflow: BUMP_WORKFLOW,
        branch: "release-x.66.x",
        status: "in_progress",
        conclusion: "",
        displayTitle: "Bump Embedding SDK version (beta) on release-x.66.x",
        url: "https://github.com/metabase/metabase/actions/runs/8",
      });
    });
    expect((await checkBetaBump(66)).state).toBe("inProgress");
  });

  test("a leftover bump branch with no PR: a person deletes it", async () => {
    fakeWorld("beta", 66, (world) => {
      world.branches[`${METABASE}@sdk-version-bump-0.66.0-beta.0`] = {
        ...world.branches[`${METABASE}@release-x.66.x`],
      };
    });
    const result = await checkBetaBump(66);
    expect(result.state).toBe("manual");
    expect(linesOf(result)).toContain("exists with no open PR");
  });

  test("CODEOWNERS after a first beta merged without the mute: a person opens a PR", async () => {
    fakeWorld("beta", 66, (world) =>
      setEmbeddingSdkVersion(world, "release-x.66.x", "0.66.0-beta.0"),
    );
    const result = await checkCodeowners(66);
    expect(result.state).toBe("manual");
    expect(linesOf(result)).toContain("comments them out");
  });
});

describe("sample repo update PRs", () => {
  test("nextjs: the PR has the image, both routers and both lockfiles on 65", async () => {
    const store = fakeWorld("gold", 65);
    const { outcome } = await runTheAction(await checkSampleRepo(NEXTJS, 65));
    expect(outcome).toBe("done");

    const files = store.load().branches[`${NEXTJS.name}@update-to-65`];
    expect(files["docker-compose.yml"]).toContain(
      "metabase/metabase-enterprise:v1.65.x",
    );
    for (const folder of [
      "next-sample-app-router",
      "next-sample-pages-router",
    ]) {
      expect(files[`${folder}/package.json`]).toContain('"^0.65.0"');
      expect(files[`${folder}/package-lock.json`]).toContain('"0.65.1"');
    }

    const result = await checkSampleRepo(NEXTJS, 65);
    expect(result.state).toBe("manual");
    expect(linesOf(result)).toContain("review and merge");
  });

  test("shoppy: the lockfile is yarn.lock", async () => {
    const store = fakeWorld("gold", 65);
    await runTheAction(await checkSampleRepo(SHOPPY, 65));
    const files = store.load().branches[`${SHOPPY.name}@update-to-65`];
    expect(files["yarn.lock"]).toContain('version "0.65.1"');
  });

  test("modular needs no npm release, the others wait for the patch bump", async () => {
    fakeWorld("gold", 65, (world) => {
      delete world.npmDistTags["65-stable"];
    });
    expect((await checkSampleRepo(MODULAR, 65)).state).toBe("todo");
    const react = await checkSampleRepo(REACT, 65);
    expect(react.state).toBe("blocked");
    expect(linesOf(react)).toContain("blocked by the patch bump");
  });

  test("no Docker image v1.65.x yet: blocked", async () => {
    fakeWorld("gold", 65, (world) => {
      world.dockerImageTags = ["v1.64.x"];
    });
    expect((await checkSampleRepo(MODULAR, 65)).state).toBe("blocked");
  });

  test("a later pin of the same major is done", async () => {
    fakeWorld("gold", 65, (world) => {
      const files = sampleRepoFiles(REACT, 65, "0.65.1");
      files["docker-compose.yml"] = files["docker-compose.yml"].replace(
        "v1.65.x",
        "v1.65.2",
      );
      files["client/package.json"] = files["client/package.json"].replace(
        "^0.65.0",
        "^0.65.1",
      );
      setSampleRepoBranch(world, REACT, "main", files);
    });
    expect((await checkSampleRepo(REACT, 65)).state).toBe("done");
  });

  test("a prerelease pin is not done", async () => {
    fakeWorld("gold", 65, (world) => {
      const files = sampleRepoFiles(REACT, 65, "0.65.1");
      files["client/package.json"] = files["client/package.json"].replace(
        "^0.65.0",
        "^0.65.0-alpha.0",
      );
      setSampleRepoBranch(world, REACT, "main", files);
    });
    expect((await checkSampleRepo(REACT, 65)).state).not.toBe("done");
  });

  test("pins on 65 but the lockfile on 64: the PR changes only the lockfile", async () => {
    const store = fakeWorld("gold", 65, (world) =>
      setSampleRepoBranch(
        world,
        REACT,
        "main",
        sampleRepoFiles(REACT, 65, "0.64.0"),
      ),
    );
    const before = await checkSampleRepo(REACT, 65);
    expect(before.state).toBe("todo");
    await runTheAction(before);

    const main = store.load().branches[`${REACT.name}@main`];
    const files = store.load().branches[`${REACT.name}@update-to-65`];
    expect(files["client/package-lock.json"]).toContain('"0.65.1"');
    expect(files["client/package.json"]).toBe(main["client/package.json"]);
    expect(files["docker-compose.yml"]).toBe(main["docker-compose.yml"]);
  });

  test("a closed PR whose branch still exists: a person deletes the branch; then a new PR", async () => {
    const store = fakeWorld("gold", 65, (world) => {
      setSampleRepoBranch(
        world,
        REACT,
        "update-to-65",
        sampleRepoFiles(REACT, 64, "0.64.0"),
      );
      addPullRequest(world, {
        repo: REACT.name,
        base: "main",
        head: "update-to-65",
        state: "CLOSED",
      });
    });
    expect((await checkSampleRepo(REACT, 65)).state).toBe("manual");

    editWorld(store, (world) => {
      delete world.branches[`${REACT.name}@update-to-65`];
    });
    expect((await checkSampleRepo(REACT, 65)).state).toBe("todo");
  });

  test("a pushed branch on 65 with no PR: the action only opens the PR", async () => {
    const store = fakeWorld("gold", 65, (world) =>
      setSampleRepoBranch(
        world,
        REACT,
        "update-to-65",
        sampleRepoFiles(REACT, 65, "0.65.1"),
      ),
    );
    const result = await checkSampleRepo(REACT, 65);
    expect(result.state).toBe("todo");
    expect(result.action?.description.join("\n")).toContain("Opens the PR");

    await runTheAction(result);
    expect(
      store
        .load()
        .pullRequests.some(
          (pr) => pr.repo === REACT.name && pr.headRefName === "update-to-65",
        ),
    ).toBe(true);
  });

  test("another open PR about 65 gives a warning and a link", async () => {
    fakeWorld("gold", 65, (world) =>
      addPullRequest(world, {
        repo: SHOPPY.name,
        base: "main",
        head: "upadte-to-65",
        state: "OPEN",
        title: "Update SDK/MB to v65",
      }),
    );
    const result = await checkSampleRepo(SHOPPY, 65);
    expect(linesOf(result)).toContain("upadte-to-65");
    expect(
      result.pullRequests?.some((pr) => pr.headRefName === "upadte-to-65"),
    ).toBe(true);
  });

  test("an image pinned by digest stops the update at the warning", async () => {
    fakeWorld("gold", 65, (world) => {
      const files = sampleRepoFiles(MODULAR, 64, "0.64.0");
      files["docker-compose.yml"] = files["docker-compose.yml"].replace(
        "v1.64.x",
        "v1.64.x@sha256:0123abcd",
      );
      setSampleRepoBranch(world, MODULAR, "main", files);
    });
    const { outcome, printed } = await runTheAction(
      await checkSampleRepo(MODULAR, 65),
      ["Continue anyway?"],
    );
    expect(outcome).toBe("stopped");
    expect(printed.join("\n")).toContain("a digest");
  });

  test("a pin that the list does not have stops the update at the warning", async () => {
    fakeWorld("gold", 65, (world) => {
      const files = sampleRepoFiles(MODULAR, 64, "0.64.0");
      files["e2e/docker-compose.yml"] = files["docker-compose.yml"];
      setSampleRepoBranch(world, MODULAR, "main", files);
    });
    const { outcome, printed } = await runTheAction(
      await checkSampleRepo(MODULAR, 65),
      ["Continue anyway?"],
    );
    expect(outcome).toBe("stopped");
    expect(printed.join("\n")).toContain("not in the expected list");
  });

  // the action updates package-lock.json when a folder has both lockfiles
  test("a folder with both lockfiles is done when package-lock.json locks 65", async () => {
    fakeWorld("gold", 65, (world) => {
      const files = sampleRepoFiles(REACT, 65, "0.65.1");
      files["client/yarn.lock"] =
        '"@metabase/embedding-sdk-react@^0.64.0":\n  version "0.64.0"\n';
      setSampleRepoBranch(world, REACT, "main", files);
    });
    expect((await checkSampleRepo(REACT, 65)).state).toBe("done");
  });

  test("a folder with both lockfiles is not done when package-lock.json locks 64", async () => {
    fakeWorld("gold", 65, (world) => {
      const files = sampleRepoFiles(REACT, 65, "0.64.0");
      files["client/yarn.lock"] =
        '"@metabase/embedding-sdk-react@^0.65.0":\n  version "0.65.1"\n';
      setSampleRepoBranch(world, REACT, "main", files);
    });
    expect((await checkSampleRepo(REACT, 65)).state).not.toBe("done");
  });

  test("two image pins in one file: after a Continue anyway and the merge, the step is done", async () => {
    const store = fakeWorld("gold", 65, (world) => {
      const files = sampleRepoFiles(MODULAR, 64, "0.64.0");
      files["docker-compose.yml"] +=
        "  metabase-2:\n    image: metabase/metabase-enterprise:v1.64.x\n";
      setSampleRepoBranch(world, MODULAR, "main", files);
    });
    const { outcome, printed } = await runTheAction(
      await checkSampleRepo(MODULAR, 65),
    );
    expect(outcome).toBe("done");
    expect(printed.join("\n")).toContain(
      "we expect 1 image pin, and we found 2",
    );

    doAsAPerson(store, "merge");
    expect((await checkSampleRepo(MODULAR, 65)).state).toBe("done");
  });

  test("a package.json that the list does not have: the action updates its lockfile too", async () => {
    const store = fakeWorld("gold", 65, (world) => {
      const files = sampleRepoFiles(REACT, 64, "0.64.0");
      files["extra/package.json"] = files["client/package.json"];
      files["extra/package-lock.json"] = files["client/package-lock.json"];
      setSampleRepoBranch(world, REACT, "main", files);
    });
    const { outcome } = await runTheAction(await checkSampleRepo(REACT, 65));
    expect(outcome).toBe("done");

    const files = store.load().branches[`${REACT.name}@update-to-65`];
    expect(files["extra/package.json"]).toContain('"^0.65.0"');
    expect(files["extra/package-lock.json"]).toContain('"0.65.1"');
  });

  test("a lockfile with a prerelease, or below the range of its package.json, is not done", async () => {
    fakeWorld("gold", 65, (world) =>
      setSampleRepoBranch(
        world,
        REACT,
        "main",
        sampleRepoFiles(REACT, 65, "0.65.0-beta.0"),
      ),
    );
    expect((await checkSampleRepo(REACT, 65)).state).not.toBe("done");

    fakeWorld("gold", 65, (world) => {
      const files = sampleRepoFiles(REACT, 65, "0.65.1");
      files["client/package.json"] = files["client/package.json"].replace(
        "^0.65.0",
        "^0.65.9",
      );
      setSampleRepoBranch(world, REACT, "main", files);
    });
    expect((await checkSampleRepo(REACT, 65)).state).not.toBe("done");
  });

  test("a lockfile with a prerelease: the action locks a released version", async () => {
    const store = fakeWorld("gold", 65, (world) =>
      setSampleRepoBranch(
        world,
        REACT,
        "main",
        sampleRepoFiles(REACT, 65, "0.65.0-beta.0"),
      ),
    );
    await runTheAction(await checkSampleRepo(REACT, 65));
    const files = store.load().branches[`${REACT.name}@update-to-65`];
    expect(files["client/package-lock.json"]).toContain('"0.65.1"');
  });

  test("a pin in a file with a space in its name: the action commits it", async () => {
    const store = fakeWorld("gold", 65, (world) => {
      const files = sampleRepoFiles(MODULAR, 64, "0.64.0");
      files["extra compose.yml"] = files["docker-compose.yml"];
      setSampleRepoBranch(world, MODULAR, "main", files);
    });
    const { outcome } = await runTheAction(await checkSampleRepo(MODULAR, 65));
    expect(outcome).toBe("done");
    const files = store.load().branches[`${MODULAR.name}@update-to-65`];
    expect(files["extra compose.yml"]).toContain("v1.65.x");
  });

  test("the Shoppy PR says to wait for the production instance; the others do not", async () => {
    const store = fakeWorld("gold", 65);
    await runTheAction(await checkSampleRepo(SHOPPY, 65));
    await runTheAction(await checkSampleRepo(MODULAR, 65));
    const bodyOf = (repo: SampleRepo) =>
      store.load().pullRequests.find((pr) => pr.repo === repo.name)?.body ?? "";
    expect(bodyOf(SHOPPY)).toContain(
      "⚠️ Merge this PR only after https://shoppy.metabaseapp.com runs Metabase 65.",
    );
    expect(bodyOf(SHOPPY)).toContain(
      "Merging it deploys the Shoppy frontend to production, with Embedding SDK 0.65.",
    );
    expect(bodyOf(MODULAR)).not.toContain("Merge this PR only after");
  });
});

describe("react 65-stable and the default branch", () => {
  // the update PR is merged: main is on 65, 65-stable is still the old main
  const afterTheMerge = (world: FakeWorld) =>
    setSampleRepoBranch(
      world,
      REACT,
      "main",
      sampleRepoFiles(REACT, 65, "0.65.1"),
    );

  test("main is ahead of 65-stable: the step shows the commits, then fast-forwards it after a yes", async () => {
    const store = fakeWorld("gold", 65, afterTheMerge);
    const before = await checkStableBranchFastForward(REACT, 65);
    expect(before.state).toBe("todo");
    expect(linesOf(before)).toContain(
      "main has 1 commits that 65-stable does not have",
    );
    const description = before.action?.description.join("\n") ?? "";
    expect(description).toContain("fake commit: docker-compose.yml");
    expect(description).toContain("-F force=false");
    expect(description).toContain("It does not change the default branch");

    const { printed } = await runTheAction(before);
    expect(printed.join("\n")).toContain(
      `Check it: https://github.com/${REACT.name}/tree/65-stable`,
    );
    const branches = store.load().branches;
    expect(branches[`${REACT.name}@65-stable`]).toEqual(
      branches[`${REACT.name}@main`],
    );
    expect((await checkStableBranchFastForward(REACT, 65)).state).toBe("done");
    expect(store.load().defaultBranches[REACT.name]).toBe("64-stable");
  });

  test("after the fast-forward, the default branch is its own step, with its own yes", async () => {
    const store = fakeWorld("gold", 65, afterTheMerge);
    expect((await checkDefaultBranch(REACT, 65)).state).toBe("blocked");
    await runTheAction(await checkStableBranchFastForward(REACT, 65));

    const before = await checkDefaultBranch(REACT, 65);
    expect(before.state).toBe("todo");
    expect(linesOf(before)).toContain("the default branch is 64-stable");
    expect(before.action?.description.join("\n")).toContain(
      "from 64-stable to 65-stable",
    );

    const { printed } = await runTheAction(before);
    expect(printed.join("\n")).toContain(
      `Check it: https://github.com/${REACT.name}`,
    );
    expect(store.load().defaultBranches[REACT.name]).toBe("65-stable");
    expect((await checkDefaultBranch(REACT, 65)).state).toBe("done");
  });

  // after the release, fixes go to 65-stable with their own PRs
  const backportOn65Stable = (world: FakeWorld) => {
    afterTheMerge(world);
    const files = sampleRepoFiles(REACT, 65, "0.65.1");
    files["e2e/retries.txt"] = "retry failed e2e tests once\n";
    setSampleRepoBranch(world, REACT, "65-stable", files);
    world.comparisons = { [`${REACT.name}:65-stable...main`]: "diverged" };
  };

  test("a backport on 65-stable after the release: the fast-forward step stays done", async () => {
    fakeWorld("gold", 65, backportOn65Stable);
    const result = await checkStableBranchFastForward(REACT, 65);
    expect(result.state).toBe("done");
    expect(linesOf(result)).toContain("65-stable is on 65");
  });

  test("a backport on 65-stable after the release: the default-branch step stays done", async () => {
    fakeWorld("gold", 65, (world) => {
      backportOn65Stable(world);
      world.defaultBranches[REACT.name] = "65-stable";
    });
    expect((await checkDefaultBranch(REACT, 65)).state).toBe("done");
  });

  test("65-stable and main have diverged: a person reconciles them, and nothing is offered", async () => {
    fakeWorld("gold", 65, (world) => {
      afterTheMerge(world);
      world.comparisons = { [`${REACT.name}:65-stable...main`]: "diverged" };
    });
    const result = await checkStableBranchFastForward(REACT, 65);
    expect(result.state).toBe("manual");
    expect(linesOf(result)).toContain("is not on 65 yet");
    expect(result.action).toBeUndefined();
    expect((await checkDefaultBranch(REACT, 65)).state).toBe("blocked");
  });

  test("no 65-stable yet: the cron creates it, and no default-branch command yet", async () => {
    fakeWorld("gold", 65, (world) => {
      afterTheMerge(world);
      delete world.branches[`${REACT.name}@65-stable`];
    });
    const result = await checkStableBranchFastForward(REACT, 65);
    expect(result.state).toBe("inProgress");
    expect(linesOf(result)).not.toContain("gh repo edit");
  });

  test("no 65-stable, and the last run of the hourly workflow failed: a person creates it", async () => {
    fakeWorld("gold", 65, (world) => {
      afterTheMerge(world);
      delete world.branches[`${REACT.name}@65-stable`];
      world.workflowRuns.push({
        repo: REACT.name,
        workflow: "create-version-branch.yml",
        branch: "64-stable",
        status: "completed",
        conclusion: "failure",
        displayTitle:
          "Check the Metabase SDK version and create a version branch",
        url: `https://github.com/${REACT.name}/actions/runs/11`,
      });
    });
    const result = await checkStableBranchFastForward(REACT, 65);
    expect(result.state).toBe("manual");
    expect(linesOf(result)).toContain(
      `failed: https://github.com/${REACT.name}/actions/runs/11`,
    );
    expect(linesOf(result)).toContain("gh api -X POST");
  });

  test("65-stable contains main but still pins 64: a person fixes it", async () => {
    fakeWorld("gold", 65, (world) => {
      afterTheMerge(world);
      world.comparisons = { [`${REACT.name}:65-stable...main`]: "behind" };
    });
    const result = await checkStableBranchFastForward(REACT, 65);
    expect(result.state).toBe("manual");
    expect(linesOf(result)).toContain("Fix it by hand");
  });
});

describe("the Shoppy production instance", () => {
  test("on 64: a person upgrades it", async () => {
    fakeWorld("gold", 65);
    expect((await checkShoppyProductionInstance(65)).state).toBe("manual");
  });

  test("on 65: done", async () => {
    fakeWorld("gold", 65, (world) => {
      world.shoppyProductionVersion = "v1.65.0";
    });
    expect((await checkShoppyProductionInstance(65)).state).toBe("done");
  });

  test("no answer: error", async () => {
    fakeWorld("gold", 65, (world) => {
      world.shoppyProductionVersion = null;
    });
    expect((await checkShoppyProductionInstance(65)).state).toBe("error");
  });
});

test("a check that throws shows as an error", async () => {
  const result = await checkWithoutThrowing({
    check: async () => {
      throw new Error("GitHub is down");
    },
  });
  expect(result.state).toBe("error");
  expect(linesOf(result)).toContain("GitHub is down");
});

describe("a bump of another version on its way at gold", () => {
  // someone dispatched a beta bump during the betas, and nobody merged it
  test("an open beta bump PR: merge or close it first, and no second PR", async () => {
    const store = fakeWorld("gold", 65, (world) => {
      setEmbeddingSdkVersion(world, "release-x.65.x", "0.65.0-beta.1");
      addPullRequest(world, {
        repo: METABASE,
        base: "release-x.65.x",
        head: "sdk-version-bump-0.65.0-beta.2",
        state: "OPEN",
      });
    });
    const result = await checkPatchBump(65);
    expect(result.state).toBe("manual");
    expect(linesOf(result)).toContain("sdk-version-bump-0.65.0-beta.2");
    expect(linesOf(result)).toContain("merge or close it first");
    expect(
      store.load().pullRequests.filter((pr) => pr.state === "OPEN"),
    ).toHaveLength(1);
  });

  test("a beta bump run that still runs: in progress", async () => {
    fakeWorld("gold", 65, (world) => {
      setEmbeddingSdkVersion(world, "release-x.65.x", "0.65.0-beta.1");
      world.workflowRuns.push({
        workflow: BUMP_WORKFLOW,
        branch: "release-x.65.x",
        status: "in_progress",
        conclusion: "",
        displayTitle: "Bump Embedding SDK version (beta) on release-x.65.x",
        url: "https://github.com/metabase/metabase/actions/runs/12",
      });
    });
    expect((await checkPatchBump(65)).state).toBe("inProgress");
  });
});

describe("npm in each check round", () => {
  test("a version that npm gets after a round shows at the next round", async () => {
    const store = fakeWorld("gold", 65, (world) => {
      setEmbeddingSdkVersion(world, "master", "0.66.0-alpha.0");
      addPullRequest(world, {
        repo: METABASE,
        base: "master",
        head: "sdk-version-bump-0.66.0-alpha.0",
        state: "MERGED",
      });
    });
    expect((await checkPreminorBump(65)).state).toBe("inProgress");

    // the release run publishes; the TUI starts a new round on r
    const world = store.load();
    world.npmDistTags["66-alpha"] = "0.66.0-alpha.0";
    store.save(world);
    forgetNpmDistTags();
    expect((await checkPreminorBump(65)).state).toBe("done");
  });

  test("a failed read of npm is not kept: the next check reads npm again", async () => {
    const store = fakeWorld("gold", 65);
    const fake = fakeExternalCalls(store);
    let reads = 0;
    replaceExternalCalls({
      ...fake,
      npmDistTags: async () => {
        reads += 1;
        if (reads === 1) {
          throw new Error("npm dist-tags: HTTP 503");
        }
        return fake.npmDistTags();
      },
    });
    const failed = await checkWithoutThrowing({
      check: () => checkPatchBump(65),
    });
    expect(failed.state).toBe("error");
    expect(linesOf(failed)).toContain("HTTP 503");
    expect((await checkPatchBump(65)).state).toBe("done");
  });
});

describe("an old checklist", () => {
  test("is over when npm latest is on a newer major", () => {
    expect(isChecklistOver("gold", 65, "0.65.1")).toBe(false);
    expect(isChecklistOver("gold", 65, "0.66.0")).toBe(true);
    expect(isChecklistOver("beta", 66, "0.65.1")).toBe(false);
    expect(isChecklistOver("beta", 66, "0.66.0")).toBe(true);
  });

  test("the script stops at the start, and names the current checklists", () => {
    const stateFile = path.join(testTempFolder, "gold-65-after-66.json");
    const world = fakeWorldFor("gold", 65);
    world.npmDistTags.latest = "0.66.0";
    writeFileSync(stateFile, JSON.stringify(world));
    const run = Bun.spawnSync(
      [
        process.execPath,
        ENTRY,
        "gold",
        "65",
        "--dry-run",
        `--fake=${stateFile}`,
      ],
      { timeout: 30_000, killSignal: "SIGKILL" },
    );
    expect(run.exitCode).toBe(1);
    expect(run.stderr.toString()).toContain('Run "gold 66" or "beta 67"');
  });
});

test("with no terminal, the checklist stops with an error", () => {
  const stateFile = path.join(testTempFolder, "no-terminal.json");
  const run = Bun.spawnSync(
    [process.execPath, ENTRY, "gold", "65", `--fake=${stateFile}`],
    { stdin: "ignore", timeout: 30_000, killSignal: "SIGKILL" },
  );
  expect(run.exitCode).toBe(1);
  expect(run.stderr.toString()).toContain("not supported");
});

// on a local bare repo, so nothing leaves this machine
test("the real push refuses a branch that someone created after our check", async () => {
  const remote = path.join(testTempFolder, "remote.git");
  const clone = path.join(testTempFolder, "clone");
  const git = (folder: string) =>
    $.cwd(folder).env({
      ...process.env,
      GIT_AUTHOR_NAME: "test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "test",
      GIT_COMMITTER_EMAIL: "test@example.com",
    });
  await $`git init -q --bare -b main ${remote}`.quiet();
  await $`git init -q -b main ${clone}`.quiet();
  await git(clone)`git remote add origin ${remote}`.quiet();
  await git(clone)`git commit -q --allow-empty -m main`.quiet();
  await git(clone)`git push -q origin main`.quiet();
  // someone creates update-to-65 from main, with no commit on it yet
  await git(clone)`git push -q origin main:refs/heads/update-to-65`.quiet();
  // ours is main plus one commit: a plain push would fast-forward theirs
  await git(clone)`git switch -q -c update-to-65`.quiet();
  await git(clone)`git commit -q --allow-empty -m ours`.quiet();

  const { pushNewBranch } = realExternalCalls();
  await expect(
    pushNewBranch("any/repo", clone, "update-to-65"),
  ).rejects.toThrow();

  await git(clone)`git switch -q -c update-to-66`.quiet();
  await expect(
    pushNewBranch("any/repo", clone, "update-to-66"),
  ).resolves.toBeUndefined();
});

describe("links", () => {
  test("a published bump links its release run and its npm page", async () => {
    fakeWorld("gold", 65);
    const result = await checkPatchBump(65);
    expect(result.links?.map((link) => link.url)).toEqual(
      expect.arrayContaining([
        "https://github.com/metabase/metabase/actions/runs/fake-0.65.1",
        "https://www.npmjs.com/package/@metabase/embedding-sdk-react/v/0.65.1",
      ]),
    );
  });

  test("before the cut, the beta bump has no links and no error", async () => {
    fakeWorld("beta", 66, (world) => {
      delete world.branches[`${METABASE}@release-x.66.x`];
    });
    const result = await checkBetaBump(66);
    expect(result.state).toBe("blocked");
    expect(result.links).toEqual([]);
  });

  test("the CODEOWNERS commit prints the link of the commit", async () => {
    fakeWorld("beta", 66);
    await runTheAction(await checkBetaBump(66));
    const { printed } = await runTheAction(await checkCodeowners(66));
    expect(printed.join("\n")).toContain(
      "Check it: https://github.com/metabase/metabase/commit/fake-",
    );
    expect((await checkCodeowners(66)).links?.map((link) => link.url)).toEqual([
      "https://github.com/metabase/metabase/blob/release-x.66.x/.github/CODEOWNERS",
    ]);
  });

  test("a sample repo update prints the link of its PR, and links the pinned files", async () => {
    fakeWorld("gold", 65);
    const before = await checkSampleRepo(MODULAR, 65);
    expect(before.links?.map((link) => link.url)).toEqual([
      `https://github.com/${MODULAR.name}/blob/main/docker-compose.yml`,
    ]);
    const { printed } = await runTheAction(before);
    expect(printed.join("\n")).toContain(
      `Opened the PR. Check it: https://github.com/${MODULAR.name}/pull/`,
    );
  });

  test("the stable steps link the branch, the compare view, the cron and the settings", async () => {
    fakeWorld("gold", 65);
    const fastForward = await checkStableBranchFastForward(REACT, 65);
    expect(fastForward.links?.map((link) => link.url)).toEqual([
      `https://github.com/${REACT.name}/tree/65-stable`,
      `https://github.com/${REACT.name}/compare/65-stable...main`,
      `https://github.com/${REACT.name}/actions/workflows/create-version-branch.yml`,
    ]);
    const defaultBranch = await checkDefaultBranch(REACT, 65);
    expect(defaultBranch.links?.map((link) => link.url)).toEqual([
      `https://github.com/${REACT.name}/settings`,
    ]);
  });

  test("the Shoppy instance step links the instance", async () => {
    fakeWorld("gold", 65);
    expect(
      (await checkShoppyProductionInstance(65)).links?.map((link) => link.url),
    ).toEqual(["https://shoppy.metabaseapp.com"]);
  });
});

// what each --scenario promises in its "about"
describe("the fake scenarios", () => {
  const scenarioChecks: {
    phase: "gold" | "beta";
    major: number;
    scenario: string;
    check: () => Promise<StepResult>;
    state: StepResult["state"];
    line: string;
  }[] = [
    {
      phase: "gold",
      major: 65,
      scenario: "beta-pr-open",
      check: () => checkPatchBump(65),
      state: "manual",
      line: "merge or close it first",
    },
    {
      phase: "gold",
      major: 65,
      scenario: "two-pins",
      check: () => checkSampleRepo(MODULAR, 65),
      state: "todo",
      line: "docker-compose.yml v1.64.x v1.64.x",
    },
    {
      phase: "gold",
      major: 65,
      scenario: "space-in-name",
      check: () => checkSampleRepo(MODULAR, 65),
      state: "todo",
      line: "docker-compose.yml v1.64.x",
    },
    {
      phase: "gold",
      major: 65,
      scenario: "beta-lockfile",
      check: () => checkSampleRepo(REACT, 65),
      state: "todo",
      line: "client/package-lock.json 0.65.0-beta.0",
    },
    {
      phase: "gold",
      major: 65,
      scenario: "cron-failed",
      check: () => checkStableBranchFastForward(REACT, 65),
      state: "manual",
      line: "the last run of the hourly create-version-branch.yml failed",
    },
    {
      phase: "beta",
      major: 66,
      scenario: "bump-failed",
      check: () => checkBetaBump(66),
      state: "todo",
      line: "the last bump run failed",
    },
    {
      phase: "beta",
      major: 66,
      scenario: "release-skipped",
      check: () => checkBetaBump(66),
      state: "manual",
      line: "was skipped",
    },
    {
      phase: "beta",
      major: 66,
      scenario: "release-by-hand-running",
      check: () => checkBetaBump(66),
      state: "inProgress",
      line: "the release run is publishing 0.66.0-beta.0",
    },
    {
      phase: "beta",
      major: 66,
      scenario: "release-by-hand-failed",
      check: () => checkBetaBump(66),
      state: "manual",
      line: "the release run of 0.66.0-beta.0 failed",
    },
  ];

  for (const { phase, major, scenario, check, state, line } of scenarioChecks) {
    test(`${phase} ${major} --scenario=${scenario}`, async () => {
      replaceExternalCalls(
        fakeExternalCalls(
          fakeStoreInMemory(fakeWorldFor(phase, major, scenario)),
        ),
      );
      const result = await check();
      expect(result.state).toBe(state);
      expect(linesOf(result)).toContain(line);
    });
  }

  test("old-checklist: npm latest is past gold 65", () => {
    const world = fakeWorldFor("gold", 65, "old-checklist");
    expect(isChecklistOver("gold", 65, world.npmDistTags.latest)).toBe(true);
  });

  test("every scenario is in the list above", () => {
    const listed = new Set([
      ...scenarioChecks.map(
        ({ phase, major, scenario }) => `${phase} ${major} ${scenario}`,
      ),
      "gold 65 today",
      "gold 65 old-checklist",
      "beta 66 today",
    ]);
    const all = [
      ...Object.keys(fakeScenariosFor("gold", 65)).map(
        (name) => `gold 65 ${name}`,
      ),
      ...Object.keys(fakeScenariosFor("beta", 66)).map(
        (name) => `beta 66 ${name}`,
      ),
    ];
    expect(all.filter((name) => !listed.has(name))).toEqual([]);
  });
});

test("the colors change no text, and a link stays one piece", () => {
  const line =
    "bump release-x.65.x to 0.65.0 on metabase/metabase (Metabase 65): https://github.com/metabase/metabase/pull/1";
  const colored = highlight(line);
  expect(stripANSI(colored)).toBe(line);
  expect(colored).toContain("\u001b[35mrelease-x.65.x\u001b[0m");
  expect(colored).toContain("\u001b[36m0.65.0\u001b[0m");
  expect(colored).toContain("\u001b[32mmetabase/metabase\u001b[0m");
  expect(colored).toContain(
    "\u001b[34mhttps://github.com/metabase/metabase/pull/1\u001b[0m",
  );
  expect(highlight("nextjs: update main")).toContain(
    "\u001b[1;32mnextjs\u001b[0m",
  );
  expect(highlight("sdk-version-bump-pr.yml")).toBe("sdk-version-bump-pr.yml");
  expect(highlight("sdk-version-bump-0.65.0")).toContain(
    "\u001b[35msdk-version-bump-0.65.0\u001b[0m",
  );
});

describe("links of this release and of earlier releases", () => {
  const earlierRelease = (result: StepResult) => [
    ...(result.pullRequests ?? [])
      .filter((pr) => pr.isAboutAnEarlierRelease)
      .map((pr) => pr.url),
    ...(result.links ?? [])
      .filter((link) => link.isAboutAnEarlierRelease)
      .map((link) => link.label),
  ];
  const thisRelease = (result: StepResult) => [
    ...(result.pullRequests ?? [])
      .filter((pr) => !pr.isAboutAnEarlierRelease)
      .map((pr) => pr.url),
    ...(result.links ?? [])
      .filter((link) => !link.isAboutAnEarlierRelease)
      .map((link) => link.label),
  ];

  test("step 2 puts the preminor of 64 gold under earlier releases, and its own PR under this release", async () => {
    fakeWorld("gold", 65);
    const before = await checkPreminorBump(65);
    expect(thisRelease(before)).toEqual([]);
    expect(earlierRelease(before)).toEqual([
      "https://github.com/metabase/metabase/pull/84154",
      "0.65.0-alpha.0 on npm",
    ]);

    await runTheAction(before);
    const after = await checkPreminorBump(65);
    expect(thisRelease(after)).toEqual([
      "https://github.com/metabase/metabase/pull/90003",
      expect.stringMatching(/^bump run on master \(/),
    ]);
    expect(earlierRelease(after)).toEqual([
      "https://github.com/metabase/metabase/pull/84154",
      "0.65.0-alpha.0 on npm",
    ]);
  });

  test("step 1 has only links of this release", async () => {
    fakeWorld("gold", 65);
    const result = await checkPatchBump(65);
    expect(earlierRelease(result)).toEqual([]);
    expect(thisRelease(result)).toEqual([
      "https://github.com/metabase/metabase/pull/85635",
      "npm release run of 0.65.1",
      "0.65.1 on npm",
    ]);
  });

  test("the panel shows the two headers, and no link that a line above already shows", async () => {
    fakeWorld("gold", 65);
    await runTheAction(await checkPreminorBump(65));
    const result = await checkPreminorBump(65);
    const sections = stripANSI(linkSectionsOf(result).join("\n"));
    expect(sections).toContain("Links about this release:");
    expect(sections).toContain("Links about earlier releases, for reference:");
    // "review and merge <the open PR>" is a line of the step
    expect(linesOf(result)).toContain("pull/90003");
    expect(sections).not.toContain("pull/90003");
    expect(sections).toContain("pull/84154");
  });
});
