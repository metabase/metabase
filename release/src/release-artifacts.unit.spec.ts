import {
  buildReleaseArtifactMismatchMessage,
  checkReleaseArtifacts,
  getReleaseArtifactName,
} from "./release-artifacts";

const TAGGED = "2540625628432c7165de87307c993ad88f6ba716";
const DISPATCHED = "1bfedb8761c2f66c01da1f8d12818be4d9caa8f3";
const TAG_RUN_URL =
  "https://github.com/metabase/metabase/actions/runs/38220812337";

type Artifact = { name: string; expired?: boolean };

const releaseArtifacts = (commit: string, expired = false): Artifact[] => [
  { name: getReleaseArtifactName("oss", commit), expired },
  { name: getReleaseArtifactName("ee", commit), expired },
  { name: "metabase-test-ee-uberjar", expired },
];

const build = ({
  repoArtifacts = [],
  tagRuns = [{ id: 38220812337, display_title: "Tag v0.65.0-beta" }],
  tagRunArtifacts = releaseArtifacts(TAGGED),
}: {
  repoArtifacts?: Artifact[];
  tagRuns?: Array<{ id: number; display_title: string }>;
  tagRunArtifacts?: Artifact[];
} = {}) => ({
  rest: {
    actions: {
      listArtifactsForRepo: jest.fn(({ name }: { name: string }) =>
        Promise.resolve({
          data: {
            artifacts: repoArtifacts
              .filter((artifact) => artifact.name === name)
              .map((artifact) => ({ expired: false, ...artifact })),
          },
        }),
      ),
      listWorkflowRuns: jest.fn().mockResolvedValue({
        data: {
          workflow_runs: tagRuns.map((run) => ({
            ...run,
            html_url: `https://github.com/metabase/metabase/actions/runs/${run.id}`,
          })),
        },
      }),
      listWorkflowRunArtifacts: jest.fn().mockResolvedValue({
        data: {
          artifacts: tagRunArtifacts.map((artifact) => ({
            expired: false,
            ...artifact,
          })),
        },
      }),
    },
  },
});

const check = (
  github: ReturnType<typeof build>,
  { version = "v0.65.0-beta", commit = DISPATCHED } = {},
) =>
  checkReleaseArtifacts({
    github: github as any,
    owner: "metabase",
    repo: "metabase",
    version,
    commit,
  });

const failedCheck = async (...args: Parameters<typeof check>) => {
  const result = await check(...args);
  if (result.ok) {
    throw new Error("expected the check to fail");
  }
  return result;
};

describe("checkReleaseArtifacts", () => {
  it("passes when both release uberjars exist for the commit", async () => {
    const github = build({ repoArtifacts: releaseArtifacts(DISPATCHED) });

    expect(await check(github)).toEqual({ ok: true });
    expect(github.rest.actions.listWorkflowRuns).not.toHaveBeenCalled();
  });

  it("rejects a SHA that is not full length before looking anything up", async () => {
    const github = build();

    await expect(check(github, { commit: "1bfedb8" })).rejects.toThrow(
      /not a full-length commit SHA/,
    );
    expect(github.rest.actions.listArtifactsForRepo).not.toHaveBeenCalled();
  });

  it("reports the commit Release 1 built when it differs from the input", async () => {
    const result = await failedCheck(build());

    expect(result.missing).toEqual([
      getReleaseArtifactName("oss", DISPATCHED),
      getReleaseArtifactName("ee", DISPATCHED),
    ]);
    expect(result.tagRun).toEqual({
      id: 38220812337,
      url: TAG_RUN_URL,
      title: "Tag v0.65.0-beta",
      commit: TAGGED,
    });
  });

  it("only reports the edition that is missing", async () => {
    const result = await failedCheck(
      build({
        repoArtifacts: [{ name: getReleaseArtifactName("oss", DISPATCHED) }],
      }),
    );

    expect(result.missing).toEqual([getReleaseArtifactName("ee", DISPATCHED)]);
  });

  it("treats expired artifacts as missing", async () => {
    const result = await failedCheck(
      build({ repoArtifacts: releaseArtifacts(DISPATCHED, true) }),
    );

    expect(result.missing).toHaveLength(2);
  });

  it("matches a Release 1 run started with the enterprise form of the version", async () => {
    const result = await failedCheck(
      build({ tagRuns: [{ id: 1, display_title: "Tag v1.65.0-beta" }] }),
    );

    expect(result.tagRun?.commit).toBe(TAGGED);
  });

  it("ignores Release 1 runs for other versions", async () => {
    const result = await failedCheck(
      build({
        tagRuns: [
          { id: 1, display_title: "Tag v0.64.1" },
          { id: 2, display_title: "Tag v0.65.0" },
        ],
      }),
    );

    expect(result.tagRun).toBeNull();
  });

  it("reports a Release 1 run whose release uberjars have expired", async () => {
    const result = await failedCheck(
      build({ tagRunArtifacts: releaseArtifacts(TAGGED, true) }),
    );

    expect(result.tagRun?.commit).toBeNull();
  });
});

describe("buildReleaseArtifactMismatchMessage", () => {
  const base = {
    ok: false as const,
    version: "v0.65.0-beta",
    commit: DISPATCHED,
    missing: [
      getReleaseArtifactName("oss", DISPATCHED),
      getReleaseArtifactName("ee", DISPATCHED),
    ],
  };
  const tagRun = { id: 1, url: TAG_RUN_URL, title: "Tag v0.65.0-beta" };

  it("names both commits and both ways out of a mismatch", () => {
    const message = buildReleaseArtifactMismatchMessage({
      ...base,
      tagRun: { ...tagRun, commit: TAGGED },
    });

    expect(message).toContain(
      "No release uberjars for v0.65.0-beta at commit 1bfedb8",
    );
    expect(message).toContain(
      `Tag v0.65.0-beta (${TAG_RUN_URL}) built commit 2540625, not 1bfedb8.`,
    );
    expect(message).toContain(`re-run this workflow with commit ${TAGGED}`);
    expect(message).toContain(
      `re-run Release 1 for v0.65.0-beta with commit ${DISPATCHED} first`,
    );
  });

  it("formats links with the link function it is given", () => {
    const message = buildReleaseArtifactMismatchMessage(
      { ...base, tagRun: { ...tagRun, commit: TAGGED } },
      (text, url) => `<${url}|${text}>`,
    );

    expect(message).toContain(
      `<${TAG_RUN_URL}|Tag v0.65.0-beta> built commit 2540625`,
    );
  });

  it("asks for Release 1 when there is no run for the version", () => {
    const message = buildReleaseArtifactMismatchMessage({
      ...base,
      tagRun: null,
    });

    expect(message).toContain(
      'No successful "Release 1 - Tag Release Artifact" run found for v0.65.0-beta.',
    );
    expect(message).toContain(
      `Run Release 1 for v0.65.0-beta with commit ${DISPATCHED} first`,
    );
  });

  it("explains a Release 1 run with nothing left to fetch", () => {
    const message = buildReleaseArtifactMismatchMessage({
      ...base,
      tagRun: { ...tagRun, commit: null },
    });

    expect(message).toContain(
      "has no release uberjars left; they may have expired.",
    );
  });

  it("explains a run that built this commit but whose uberjars are gone", () => {
    const message = buildReleaseArtifactMismatchMessage({
      ...base,
      tagRun: { ...tagRun, commit: DISPATCHED },
    });

    expect(message).toContain(
      "built this commit, but its release uberjars could not be found.",
    );
  });
});
