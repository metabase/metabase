const {
  downgradeMajors,
  findMasterCommits,
  findPendingChangesets,
  formatReleaseNeededMessage,
  notifyReleaseNeeded,
  parsePendingChangesets,
} = require("./notify-unreleased-migrations");

describe("downgradeMajors", () => {
  it("lists the majors between the target and the current version", () => {
    expect(downgradeMajors({ target: "v1.62.x", currentVersion: 65 })).toEqual([
      63, 64, 65,
    ]);
  });

  it("is empty when the target is the current version", () => {
    expect(downgradeMajors({ target: "v1.65.x", currentVersion: 65 })).toEqual(
      [],
    );
  });
});

describe("parsePendingChangesets", () => {
  it("keeps awaiting changesets and drops missing ones", () => {
    const output = [
      "v63.a awaiting-release resources/migrations/063/a.yaml",
      "v63.b awaiting-backport resources/migrations/063/b.yaml",
      "v63.c missing resources/migrations/063/c.yaml",
      "",
    ].join("\n");
    expect(parsePendingChangesets(63, output)).toEqual([
      {
        major: 63,
        id: "v63.a",
        status: "awaiting-release",
        file: "resources/migrations/063/a.yaml",
      },
      {
        major: 63,
        id: "v63.b",
        status: "awaiting-backport",
        file: "resources/migrations/063/b.yaml",
      },
    ]);
  });
});

describe("findPendingChangesets", () => {
  it("returns the pending changesets of all majors", () => {
    const listPendingChangesets = (major) =>
      major === 63 ? "v63.a awaiting-release a.yaml\n" : "";
    expect(
      findPendingChangesets({ majors: [64, 63], listPendingChangesets }),
    ).toEqual([
      { major: 63, id: "v63.a", status: "awaiting-release", file: "a.yaml" },
    ]);
  });

  it("warns and goes on when a major cannot be checked", () => {
    const warn = jest.fn();
    const listPendingChangesets = (major) => {
      if (major === 64) {
        throw new Error("no release");
      }
      return "v63.a awaiting-backport a.yaml\n";
    };
    expect(
      findPendingChangesets({ majors: [64, 63], listPendingChangesets, warn }),
    ).toEqual([
      { major: 63, id: "v63.a", status: "awaiting-backport", file: "a.yaml" },
    ]);
    expect(warn).toHaveBeenCalledWith(
      "Could not check v64 for unreleased migrations: no release",
    );
  });
});

describe("release notification", () => {
  const owner = "metabase";
  const repo = "metabase";
  const masterSha = "50e4cd4250ef7bd054b9a798267f06881424c7bc";
  const backportSha = "8ae0ae3ee3a0a349a4e48ba1aeb1a6891e694957";
  const file = "resources/migrations/063/x.yaml";
  const masterUrl = `https://github.com/metabase/metabase/commit/${masterSha}`;

  const pr = (number, base, merged = true) => ({
    number,
    html_url: `https://github.com/metabase/metabase/pull/${number}`,
    merged_at: merged ? "2026-10-15T14:28:16Z" : null,
    base: { ref: base },
  });

  const makeGithub = () => ({
    rest: {
      repos: {
        listCommits: jest.fn(async ({ sha }) => ({
          data:
            sha === "release-x.63.x"
              ? [{ sha: "newer" }, { sha: backportSha }]
              : [{ sha: "newer" }, { sha: masterSha }],
        })),
        listPullRequestsAssociatedWithCommit: jest.fn(
          async ({ commit_sha }) => ({
            data:
              commit_sha === masterSha
                ? [pr(84259, "master")]
                : [
                    pr(84525, "release-x.63.x"),
                    pr(84542, "release-x.63.x", false),
                  ],
          }),
        ),
      },
    },
  });

  const changesets = (status) => [
    { major: 63, id: "v63.a", status, file },
    { major: 63, id: "v63.b", status, file },
  ];

  const context = { repo: { owner, repo }, runId: 1, sha: "head" };

  it("groups changesets by the master commit that added the file, with its backport", async () => {
    const github = makeGithub();
    const commits = await findMasterCommits({
      github,
      owner,
      repo,
      ref: "head",
      changesets: changesets("awaiting-release"),
      warn: jest.fn(),
    });
    expect(commits).toEqual([
      {
        sha: masterSha,
        prs: [expect.objectContaining({ number: 84259 })],
        majors: [
          {
            major: 63,
            status: "awaiting-release",
            file,
            ids: ["v63.a", "v63.b"],
            backport: {
              sha: backportSha,
              prs: [expect.objectContaining({ number: 84525 })],
            },
          },
        ],
      },
    ]);
    expect(github.rest.repos.listCommits).toHaveBeenCalledWith(
      expect.objectContaining({ sha: "head", path: file }),
    );
  });

  it("has no backport when the changesets are not backported yet", async () => {
    const github = makeGithub();
    const [commit] = await findMasterCommits({
      github,
      owner,
      repo,
      ref: "head",
      changesets: changesets("awaiting-backport"),
      warn: jest.fn(),
    });
    expect(commit.majors[0].backport).toBeNull();
    expect(github.rest.repos.listCommits).not.toHaveBeenCalledWith(
      expect.objectContaining({ sha: "release-x.63.x" }),
    );
  });

  it("warns when no master commit has the file", async () => {
    const github = makeGithub();
    github.rest.repos.listCommits.mockResolvedValue({ data: [] });
    const warn = jest.fn();
    const commits = await findMasterCommits({
      github,
      owner,
      repo,
      ref: "head",
      changesets: changesets("awaiting-backport"),
      warn,
    });
    expect(commits).toEqual([]);
    expect(warn).toHaveBeenCalledWith(`No commit on master has ${file}`);
  });

  it("links the master commit, its PR and the backport in the message", () => {
    const message = formatReleaseNeededMessage({
      owner,
      repo,
      runUrl: "https://run",
      commit: {
        sha: masterSha,
        prs: [pr(84259, "master")],
        majors: [
          {
            major: 63,
            status: "awaiting-release",
            ids: ["v63.a"],
            backport: { sha: backportSha, prs: [pr(84525, "release-x.63.x")] },
          },
          {
            major: 62,
            status: "awaiting-backport",
            ids: ["v62.a"],
            backport: null,
          },
        ],
      },
    });
    expect(message).toBe(
      [
        `:warning: *<${masterUrl}|50e4cd4250> (<https://github.com/metabase/metabase/pull/84259|#84259>) breaks cross version tests!*`,
        "It added migrations `v63.a`, `v62.a` to master, but no release of v63, v62 has them yet. Please backport and release these changes!",
        `• v63: backported in <https://github.com/metabase/metabase/commit/${backportSha}|8ae0ae3ee3> (<https://github.com/metabase/metabase/pull/84525|#84525>), but not released yet`,
        "• v62: not backported yet",
        "Cross-version downgrades from master to versions older than v63, v62 are skipped until a release has them. <https://run|Run>",
      ].join("\n"),
    );
  });

  const listPendingChangesets = (major) =>
    major === 63
      ? `v63.a awaiting-release ${file}\nv63.b awaiting-release ${file}\n`
      : "";

  it("sends one message per master commit", async () => {
    const sendSlackMessage = jest.fn(async () => ({}));
    const findSlackMessage = jest.fn(async () => null);
    await notifyReleaseNeeded({
      github: makeGithub(),
      context,
      core: { warning: jest.fn() },
      majors: [63, 64],
      listPendingChangesets,
      channelName: "release",
      findSlackMessage,
      sendSlackMessage,
    });
    expect(findSlackMessage).toHaveBeenCalledWith({
      channelName: "release",
      text: masterUrl,
    });
    expect(sendSlackMessage).toHaveBeenCalledTimes(1);
    expect(sendSlackMessage).toHaveBeenCalledWith({
      channelName: "release",
      message: expect.stringContaining("breaks cross version tests!"),
    });
  });

  it("does not send a message when the channel already has one for the master commit", async () => {
    const sendSlackMessage = jest.fn();
    await notifyReleaseNeeded({
      github: makeGithub(),
      context,
      core: { warning: jest.fn() },
      majors: [63, 64],
      listPendingChangesets,
      channelName: "release",
      findSlackMessage: jest.fn(async ({ text }) =>
        text === masterUrl ? { id: "1", body: "" } : null,
      ),
      sendSlackMessage,
    });
    expect(sendSlackMessage).not.toHaveBeenCalled();
  });
});
