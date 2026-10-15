const {
  buildCrossVersionMatrix,
  buildGatedCrossVersionMatrix,
  excludeBlockedDowngrades,
  findCommitsToRelease,
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
  it("returns the gated matrix, the skipped entries and the changesets to release", () => {
    const result = buildGatedCrossVersionMatrix({
      supportedMajors: [63, 62],
      pending: {
        63: [
          ["v63.a", "awaiting-release", "a.yaml"],
          ["v63.b", "awaiting-backport"],
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
      awaitingRelease: [{ major: 63, id: "v63.a", file: "a.yaml" }],
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
    expect(core.setOutput).toHaveBeenCalledWith("awaiting-release", "[]");
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
      "awaiting-release",
      JSON.stringify([{ major: 63, id: "v63.a", file: "a.yaml" }]),
    );
  });
});

describe("release notification", () => {
  const owner = "metabase";
  const repo = "metabase";
  const sha = "8ae0ae3ee3a0a349a4e48ba1aeb1a6891e694957";

  const makeGithub = () => ({
    rest: {
      repos: {
        listCommits: jest.fn(async () => ({
          data: [{ sha: "newer" }, { sha }],
        })),
        listPullRequestsAssociatedWithCommit: jest.fn(async () => ({
          data: [
            {
              number: 84525,
              html_url: "https://github.com/metabase/metabase/pull/84525",
              merged_at: "2026-10-15T14:28:16Z",
              base: { ref: "release-x.63.x" },
            },
            {
              number: 84542,
              html_url: "https://github.com/metabase/metabase/pull/84542",
              merged_at: null,
              base: { ref: "release-x.63.x" },
            },
          ],
        })),
      },
    },
  });

  const changesets = [
    { major: 63, id: "v63.a", file: "resources/migrations/063/x.yaml" },
    { major: 63, id: "v63.b", file: "resources/migrations/063/x.yaml" },
  ];

  it("groups changesets by the oldest commit that has the file, with its merged PRs", async () => {
    const github = makeGithub();
    const commits = await findCommitsToRelease({
      github,
      owner,
      repo,
      changesets,
      warn: jest.fn(),
    });
    expect(commits).toEqual([
      {
        major: 63,
        branch: "release-x.63.x",
        sha,
        prs: [expect.objectContaining({ number: 84525 })],
        ids: ["v63.a", "v63.b"],
      },
    ]);
    expect(
      github.rest.repos.listPullRequestsAssociatedWithCommit,
    ).toHaveBeenCalledTimes(1);
  });

  it("warns when no commit on the release branch has the file", async () => {
    const github = makeGithub();
    github.rest.repos.listCommits.mockResolvedValue({ data: [] });
    const warn = jest.fn();
    const commits = await findCommitsToRelease({
      github,
      owner,
      repo,
      changesets: [changesets[0]],
      warn,
    });
    expect(commits).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      "No commit on release-x.63.x has resources/migrations/063/x.yaml",
    );
  });

  it("links the commit and the PR in the message", () => {
    const message = formatReleaseNeededMessage({
      owner,
      repo,
      runUrl: "https://run",
      commit: {
        major: 63,
        branch: "release-x.63.x",
        sha,
        prs: [
          {
            number: 84525,
            html_url: "https://github.com/metabase/metabase/pull/84525",
          },
        ],
        ids: ["v63.a", "v63.b"],
      },
    });
    expect(message).toBe(
      [
        ":warning: *v63 needs a release.*",
        `Commit <https://github.com/metabase/metabase/commit/${sha}|8ae0ae3ee3> (<https://github.com/metabase/metabase/pull/84525|#84525>) added \`v63.a\`, \`v63.b\` to \`release-x.63.x\`, but no v63 release has it yet.`,
        "Cross-version downgrades from master to versions older than v63 are skipped until a release has it. <https://run|Run>",
      ].join("\n"),
    );
  });

  it("sends one message per commit", async () => {
    const sendSlackMessage = jest.fn(async () => ({}));
    await notifyReleaseNeeded({
      github: makeGithub(),
      context: { repo: { owner, repo }, runId: 1 },
      core: { warning: jest.fn() },
      changesets,
      channelName: "release",
      findSlackMessage: jest.fn(async () => null),
      sendSlackMessage,
    });
    expect(sendSlackMessage).toHaveBeenCalledTimes(1);
    expect(sendSlackMessage).toHaveBeenCalledWith({
      channelName: "release",
      message: expect.stringContaining("v63 needs a release"),
    });
  });

  it("does not send a message when the channel already has one for the commit", async () => {
    const sendSlackMessage = jest.fn();
    const findSlackMessage = jest.fn(async () => ({ id: "1", body: "" }));
    await notifyReleaseNeeded({
      github: makeGithub(),
      context: { repo: { owner, repo }, runId: 1 },
      core: { warning: jest.fn() },
      changesets,
      channelName: "release",
      findSlackMessage,
      sendSlackMessage,
    });
    expect(findSlackMessage).toHaveBeenCalledWith({
      channelName: "release",
      text: `https://github.com/metabase/metabase/commit/${sha}`,
    });
    expect(sendSlackMessage).not.toHaveBeenCalled();
  });
});
