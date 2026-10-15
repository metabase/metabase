const {
  buildCrossVersionMatrix,
  buildGatedCrossVersionMatrix,
  excludeBlockedDowngrades,
  findMasterCommits,
  findPendingChangesets,
  formatReleaseNeededMessage,
  generateCrossVersionMatrix,
  notifyReleaseNeeded,
  parsePendingChangesets,
} = require("./build-cross-version-matrix");

describe("buildCrossVersionMatrix", () => {
  describe("supported versions", () => {
    it("should generate a pair of entries per supported major", () => {
      const result = buildCrossVersionMatrix([59, 58, 57]);
      expect(result).toEqual({
        config: [
          { source: "HEAD", target: "v1.59.x" },
          { source: "v1.59.x", target: "HEAD" },
          { source: "HEAD", target: "v1.58.x" },
          { source: "v1.58.x", target: "HEAD" },
          { source: "HEAD", target: "v1.57.x" },
          { source: "v1.57.x", target: "HEAD" },
        ],
      });
    });

    it("should follow the supported list rather than a fixed count", () => {
      expect(buildCrossVersionMatrix([59]).config).toHaveLength(2);
      expect(buildCrossVersionMatrix([61, 60, 59, 58, 57]).config).toHaveLength(
        10,
      );
    });

    it("should skip majors that have dropped out of support", () => {
      // v1.57.x is out of support, so nothing migrates to or from it.
      const result = buildCrossVersionMatrix([59, 58, 56]);
      const versions = result.config
        .filter((e) => e.source === "HEAD")
        .map((e) => e.target);

      expect(versions).toEqual(["v1.59.x", "v1.58.x", "v1.56.x"]);
      expect(JSON.stringify(result)).not.toContain("v1.57.x");
    });

    it("should use EE prefix (v1)", () => {
      const result = buildCrossVersionMatrix([50]);
      expect(result.config[0].target).toBe("v1.50.x");
      expect(result.config[1].source).toBe("v1.50.x");
    });

    it("should create pairs in both directions (upgrade and downgrade)", () => {
      const entries = buildCrossVersionMatrix([59, 58, 57]).config;

      // Check HEAD -> version (upgrade test)
      expect(entries.filter((e) => e.source === "HEAD")).toHaveLength(3);
      // Check version -> HEAD (downgrade test)
      expect(entries.filter((e) => e.target === "HEAD")).toHaveLength(3);
    });
  });

  describe("normalization", () => {
    it("should sort majors newest first regardless of input order", () => {
      const result = buildCrossVersionMatrix([57, 59, 58]);
      const versions = result.config
        .filter((e) => e.source === "HEAD")
        .map((e) => e.target);

      expect(versions).toEqual(["v1.59.x", "v1.58.x", "v1.57.x"]);
    });

    it("should not double up on a duplicated major", () => {
      // version-info.json's `major_version_support` is append-only, so a line
      // can show up more than once.
      const result = buildCrossVersionMatrix([59, 58, 59]);
      expect(result.config).toHaveLength(4);
      expect(result).toEqual({
        config: [
          { source: "HEAD", target: "v1.59.x" },
          { source: "v1.59.x", target: "HEAD" },
          { source: "HEAD", target: "v1.58.x" },
          { source: "v1.58.x", target: "HEAD" },
        ],
      });
    });
  });

  describe("edge cases", () => {
    it("should handle version 1", () => {
      const result = buildCrossVersionMatrix([1]);
      expect(result).toEqual({
        config: [
          { source: "HEAD", target: "v1.1.x" },
          { source: "v1.1.x", target: "HEAD" },
        ],
      });
    });

    it("should handle high version numbers", () => {
      const result = buildCrossVersionMatrix([100, 99]);
      expect(result).toEqual({
        config: [
          { source: "HEAD", target: "v1.100.x" },
          { source: "v1.100.x", target: "HEAD" },
          { source: "HEAD", target: "v1.99.x" },
          { source: "v1.99.x", target: "HEAD" },
        ],
      });
    });
  });

  describe("error handling", () => {
    it("should throw for undefined supportedMajors", () => {
      expect(() => buildCrossVersionMatrix()).toThrow(
        "Invalid supportedMajors: undefined. Must be a non-empty array of positive integers.",
      );
    });

    it("should throw for an empty list", () => {
      // getSupportedMajors throws on its own when nothing is in support, so an
      // empty matrix here means something upstream went wrong — fail loudly
      // instead of silently testing no versions at all.
      expect(() => buildCrossVersionMatrix([])).toThrow(
        "Invalid supportedMajors: []. Must be a non-empty array of positive integers.",
      );
    });

    it("should throw for a non-array", () => {
      expect(() => buildCrossVersionMatrix(59)).toThrow(
        "Invalid supportedMajors: 59. Must be a non-empty array of positive integers.",
      );
    });

    it("should throw for a non-integer major", () => {
      expect(() => buildCrossVersionMatrix([59, 58.5])).toThrow(
        "Invalid major version: 58.5. Must be a positive integer.",
      );
    });

    it("should throw for a zero major", () => {
      expect(() => buildCrossVersionMatrix([59, 0])).toThrow(
        "Invalid major version: 0. Must be a positive integer.",
      );
    });

    it("should throw for a negative major", () => {
      expect(() => buildCrossVersionMatrix([-1])).toThrow(
        "Invalid major version: -1. Must be a positive integer.",
      );
    });

    it("should throw for a NaN major", () => {
      expect(() => buildCrossVersionMatrix([NaN])).toThrow(
        "Invalid major version: NaN. Must be a positive integer.",
      );
    });

    it("should throw for an undefined major", () => {
      expect(() => buildCrossVersionMatrix([59, undefined])).toThrow(
        "Invalid major version: undefined. Must be a positive integer.",
      );
    });

    it("should throw for a stringified major", () => {
      expect(() => buildCrossVersionMatrix(["59"])).toThrow(
        "Invalid major version: 59. Must be a positive integer.",
      );
    });
  });

  describe("matrix structure for GitHub Actions", () => {
    it("should return object with config array", () => {
      const result = buildCrossVersionMatrix([59, 58, 57]);
      expect(result).toHaveProperty("config");
      expect(Array.isArray(result.config)).toBe(true);
    });

    it("should produce valid JSON for GitHub Actions", () => {
      const result = buildCrossVersionMatrix([59, 58, 57]);
      const json = JSON.stringify(result);
      expect(() => JSON.parse(json)).not.toThrow();

      const parsed = JSON.parse(json);
      expect(parsed.config).toHaveLength(6);
      expect(parsed.config[0]).toEqual({
        source: "HEAD",
        target: "v1.59.x",
      });
    });

    it("should have consistent entry structure", () => {
      const result = buildCrossVersionMatrix([59, 58, 57, 56, 55]);

      result.config.forEach((entry) => {
        expect(entry).toHaveProperty("source");
        expect(entry).toHaveProperty("target");
        expect(typeof entry.source).toBe("string");
        expect(typeof entry.target).toBe("string");
        // Either source or target should be HEAD
        expect(entry.source === "HEAD" || entry.target === "HEAD").toBeTruthy();
      });
    });

    it("should interleave upgrade and downgrade tests", () => {
      const result = buildCrossVersionMatrix([59, 58]);

      expect(result.config[0]).toEqual({
        source: "HEAD",
        target: "v1.59.x",
      });
      expect(result.config[1]).toEqual({
        source: "v1.59.x",
        target: "HEAD",
      });
      expect(result.config[2]).toEqual({
        source: "HEAD",
        target: "v1.58.x",
      });
      expect(result.config[3]).toEqual({
        source: "v1.58.x",
        target: "HEAD",
      });
    });
  });
});

describe("excludeBlockedDowngrades", () => {
  const { config } = buildCrossVersionMatrix([65, 64, 63, 62]);

  it("keeps every entry when no major is blocked", () => {
    expect(excludeBlockedDowngrades(config, [])).toEqual(config);
  });

  it("drops downgrades whose cascade passes through a blocked major", () => {
    expect(excludeBlockedDowngrades(config, [63])).toEqual([
      { source: "HEAD", target: "v1.65.x" },
      { source: "v1.65.x", target: "HEAD" },
      { source: "HEAD", target: "v1.64.x" },
      { source: "v1.64.x", target: "HEAD" },
      { source: "HEAD", target: "v1.63.x" },
      { source: "v1.63.x", target: "HEAD" },
      { source: "v1.62.x", target: "HEAD" },
    ]);
  });

  it("never drops upgrades", () => {
    const upgrades = excludeBlockedDowngrades(config, [65]).filter(
      (entry) => entry.target === "HEAD",
    );
    expect(upgrades).toHaveLength(4);
  });
});

describe("parsePendingChangesets", () => {
  it("keeps awaiting changesets and drops missing ones", () => {
    const output = [
      "v63.a awaiting-release resources/migrations/063/a.yaml",
      "v63.b awaiting-backport",
      "v63.c missing",
      "",
    ].join("\n");
    expect(parsePendingChangesets(output)).toEqual([
      ["v63.a", "awaiting-release", "resources/migrations/063/a.yaml"],
      ["v63.b", "awaiting-backport"],
    ]);
  });
});

describe("findPendingChangesets", () => {
  it("returns only majors with pending changesets", () => {
    const listPendingChangesets = (major) =>
      major === 63 ? "v63.a awaiting-release a.yaml\n" : "";
    expect(
      findPendingChangesets({
        supportedMajors: [64, 63],
        listPendingChangesets,
      }),
    ).toEqual({ 63: [["v63.a", "awaiting-release", "a.yaml"]] });
  });

  it("warns and goes on when a major cannot be checked", () => {
    const warn = jest.fn();
    const listPendingChangesets = (major) => {
      if (major === 64) {
        throw new Error("no release");
      }
      return "v63.a awaiting-backport\n";
    };
    expect(
      findPendingChangesets({
        supportedMajors: [64, 63],
        listPendingChangesets,
        warn,
      }),
    ).toEqual({ 63: [["v63.a", "awaiting-backport"]] });
    expect(warn).toHaveBeenCalledWith(
      "Could not check v64 for unreleased migrations: no release",
    );
  });
});

describe("buildGatedCrossVersionMatrix", () => {
  it("returns the gated matrix, the skipped entries and the unreleased changesets", () => {
    const result = buildGatedCrossVersionMatrix({
      supportedMajors: [63, 62],
      pending: {
        63: [
          ["v63.a", "awaiting-release", "a.yaml"],
          ["v63.b", "awaiting-backport", "b.yaml"],
        ],
      },
    });
    expect(result).toEqual({
      config: [
        { source: "HEAD", target: "v1.63.x" },
        { source: "v1.63.x", target: "HEAD" },
        { source: "v1.62.x", target: "HEAD" },
      ],
      skipped: [{ source: "HEAD", target: "v1.62.x" }],
      unreleased: [
        { major: 63, id: "v63.a", status: "awaiting-release", file: "a.yaml" },
        { major: 63, id: "v63.b", status: "awaiting-backport", file: "b.yaml" },
      ],
    });
  });
});

describe("generateCrossVersionMatrix", () => {
  const makeCore = () => {
    const summary = {
      addHeading: jest.fn(() => summary),
      addTable: jest.fn(() => summary),
      addList: jest.fn(() => summary),
      write: jest.fn(async () => summary),
    };
    return { warning: jest.fn(), setOutput: jest.fn(), summary };
  };

  it("sets the outputs and writes no summary when nothing is pending", async () => {
    const core = makeCore();
    await generateCrossVersionMatrix({
      core,
      supportedMajors: [63],
      listPendingChangesets: () => "",
    });
    expect(core.setOutput).toHaveBeenCalledWith("unreleased-changesets", "[]");
    expect(core.setOutput).toHaveBeenCalledWith(
      "matrix",
      JSON.stringify({ include: buildCrossVersionMatrix([63]).config }),
    );
    expect(core.summary.write).not.toHaveBeenCalled();
  });

  it("warns and writes a summary when downgrades are skipped", async () => {
    const core = makeCore();
    await generateCrossVersionMatrix({
      core,
      supportedMajors: [63, 62],
      listPendingChangesets: (major) =>
        major === 63 ? "v63.a awaiting-release a.yaml\n" : "",
    });
    expect(core.warning).toHaveBeenCalledWith(
      "Skipping HEAD → v1.62.x: master has migrations that these releases do not have yet",
    );
    expect(core.summary.addList).toHaveBeenCalledWith(["HEAD → v1.62.x"]);
    expect(core.summary.write).toHaveBeenCalled();
    expect(core.setOutput).toHaveBeenCalledWith(
      "unreleased-changesets",
      JSON.stringify([
        { major: 63, id: "v63.a", status: "awaiting-release", file: "a.yaml" },
      ]),
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

  it("sends one message per master commit", async () => {
    const sendSlackMessage = jest.fn(async () => ({}));
    const findSlackMessage = jest.fn(async () => null);
    await notifyReleaseNeeded({
      github: makeGithub(),
      context,
      core: { warning: jest.fn() },
      changesets: changesets("awaiting-release"),
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
      changesets: changesets("awaiting-release"),
      channelName: "release",
      findSlackMessage: jest.fn(async ({ text }) =>
        text === masterUrl ? { id: "1", body: "" } : null,
      ),
      sendSlackMessage,
    });
    expect(sendSlackMessage).not.toHaveBeenCalled();
  });
});
