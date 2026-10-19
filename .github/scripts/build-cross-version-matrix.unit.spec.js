const {
  buildCrossVersionMatrix,
  buildGatedCrossVersionMatrix,
  createGithubReader,
  excludeBlockedDowngrades,
  findUnreleasedChangesets,
  formatReleaseNeededMessage,
  generateCrossVersionMatrix,
  groupByMasterCommit,
  notifyReleaseNeeded,
  parseChangesetIds,
  readHeadMigrations,
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

describe("parseChangesetIds", () => {
  it("finds changeset ids with their major, quoted or not", () => {
    const text = [
      "databaseChangeLog:",
      "  - changeSet:",
      "      id: v63.2026-01-01T12:00:00",
      "  - changeSet:",
      "      id: 'v62.abc'",
      "  - changeSet:",
      '      id: "v65.x-y"',
      "      comment: id: v99.not-a-changeset",
    ].join("\n");
    expect(parseChangesetIds(text)).toEqual([
      { id: "v63.2026-01-01T12:00:00", major: 63 },
      { id: "v62.abc", major: 62 },
      { id: "v65.x-y", major: 65 },
    ]);
  });
});

describe("readHeadMigrations", () => {
  it("reads the migration files at HEAD with their blob ids", () => {
    const { execFileSync } = require("child_process");
    const fs = require("fs");
    const os = require("os");
    const path = require("path");

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cross-version-"));
    const git = (...args) =>
      execFileSync("git", ["-C", repoRoot, ...args], { encoding: "utf8" });
    fs.mkdirSync(path.join(repoRoot, "resources/migrations/063"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(repoRoot, "resources/migrations/063/a.yaml"),
      "id: v63.a\n",
    );
    fs.writeFileSync(
      path.join(repoRoot, "resources/migrations/063/b.sql"),
      "select 1;\n",
    );
    git("init", "-q");
    git("add", ".");
    git("-c", "user.name=a", "-c", "user.email=a@a", "commit", "-qm", "init");

    expect(readHeadMigrations(repoRoot)).toEqual([
      {
        path: "resources/migrations/063/a.yaml",
        oid: git("rev-parse", "HEAD:resources/migrations/063/a.yaml").trim(),
        text: "id: v63.a\n",
      },
    ]);
  });

  it("explains a failure to list the files", () => {
    expect(() => readHeadMigrations("/nonexistent")).toThrow(
      /^Could not list resources\/migrations at HEAD: /,
    );
  });
});

function historySince(commits, since) {
  return {
    before: commits.find(({ date }) => date < since)?.sha ?? null,
    recent: commits
      .filter(({ date }) => date >= since)
      .map(({ sha, prs }) => ({ sha, prs })),
  };
}

describe("findUnreleasedChangesets", () => {
  const crypto = require("crypto");
  const oidOf = (text) => crypto.createHash("sha1").update(text).digest("hex");
  const DAY_MS = 24 * 60 * 60 * 1000;
  const now = Date.parse("2026-10-19T12:00:00Z");
  const daysAgo = (days) => new Date(now - days * DAY_MS).toISOString();
  const migrations = (path) => `resources/migrations/${path}`;
  const changelog = (...ids) => ids.map((id) => `  id: ${id}\n`).join("");

  const pr = (number, base) => ({
    number,
    url: `https://github.com/metabase/metabase/pull/${number}`,
    mergedAt: "2026-10-01T00:00:00Z",
    baseRefName: base,
  });

  const makeReader = ({ snapshots, histories = {} }) => ({
    trees: jest.fn(
      async (refs) =>
        new Map(
          refs.map((ref) => [
            ref,
            snapshots[ref]
              ? new Map(
                  Object.entries(snapshots[ref]).map(([path, text]) => [
                    path,
                    oidOf(text),
                  ]),
                )
              : null,
          ]),
        ),
    ),
    blobTexts: jest.fn(
      async (locations) =>
        new Map(
          locations.map(({ ref, path }) => [
            `${ref}:${path}`,
            snapshots[ref]?.[path] ?? null,
          ]),
        ),
    ),
    histories: jest.fn(
      async (locations, since) =>
        new Map(
          locations.map(({ ref, path }) => [
            `${ref}:${path}`,
            historySince(histories[`${ref}:${path}`] ?? [], since),
          ]),
        ),
    ),
  });

  const headFilesOf = (files) =>
    Object.entries(files).map(([path, text]) => ({
      path,
      oid: oidOf(text),
      text,
    }));

  const find = ({ supportedMajors = [63], headFiles, reader }) =>
    findUnreleasedChangesets({
      supportedMajors,
      headFiles: headFilesOf(headFiles),
      headRef: "head",
      reader,
      graceDays: 3,
      now,
    });

  const unchanged = changelog("v63.old");
  const added = changelog("v63.old", "v63.new");
  const file = migrations("063/a.yaml");

  it("reads the v0.N.x tag of each major and no file contents when the release has the same files", async () => {
    const files = { [file]: unchanged };
    const reader = makeReader({ snapshots: { "v0.63.x": files } });
    const result = await find({ headFiles: files, reader });

    expect(result).toEqual({ pending: {}, failures: {} });
    expect(reader.trees).toHaveBeenCalledWith(["v0.63.x"]);
    expect(reader.blobTexts).toHaveBeenCalledWith([]);
    expect(reader.histories).not.toHaveBeenCalled();
  });

  const historyReader = (commits) =>
    makeReader({
      snapshots: {
        "v0.63.x": { [file]: unchanged },
        "master-commit": { [file]: added },
        "edit-commit": { [file]: added + "  # edit\n" },
        "older-commit": { [file]: unchanged },
      },
      histories: { [`head:${file}`]: commits },
    });

  it("marks a changeset that reached master in the grace period as in-grace-period, with its master commit", async () => {
    const reader = historyReader([
      {
        sha: "master-commit",
        date: daysAgo(1),
        prs: [pr(1, "master"), pr(9, "release-x.63.x")],
      },
      { sha: "older-commit", date: daysAgo(90), prs: [] },
    ]);
    const result = await find({ headFiles: { [file]: added }, reader });

    expect(reader.histories).toHaveBeenCalledWith(
      [{ ref: "head", path: file }],
      daysAgo(3),
    );
    expect(result).toEqual({
      pending: {
        63: [
          {
            major: 63,
            id: "v63.new",
            file,
            status: "in-grace-period",
            commit: {
              sha: "master-commit",
              prs: [
                {
                  number: 1,
                  url: "https://github.com/metabase/metabase/pull/1",
                },
              ],
            },
          },
        ],
      },
      failures: {},
    });
  });

  it("marks a changeset that reached master before the grace period as past-grace-period", async () => {
    const reader = historyReader([
      { sha: "master-commit", date: daysAgo(5), prs: [pr(1, "master")] },
      { sha: "older-commit", date: daysAgo(90), prs: [] },
    ]);
    const result = await find({ headFiles: { [file]: added }, reader });

    expect(result.pending[63]).toEqual([
      expect.objectContaining({ status: "past-grace-period", commit: null }),
    ]);
  });

  it("does not count a recent edit of the file as the commit that added an older changeset", async () => {
    const reader = historyReader([
      { sha: "edit-commit", date: daysAgo(1), prs: [pr(2, "master")] },
      { sha: "master-commit", date: daysAgo(5), prs: [pr(1, "master")] },
    ]);
    const result = await find({ headFiles: { [file]: added }, reader });

    expect(result.pending[63]).toEqual([
      expect.objectContaining({ status: "past-grace-period", commit: null }),
    ]);
  });

  it("marks a changeset as past the grace period when no master commit added it", async () => {
    const reader = makeReader({
      snapshots: { "v0.63.x": { [file]: unchanged } },
    });
    const result = await find({ headFiles: { [file]: added }, reader });

    expect(result.pending[63]).toEqual([
      expect.objectContaining({
        id: "v63.new",
        status: "past-grace-period",
        commit: null,
      }),
    ]);
  });

  it("finds a changeset that a release has in another file", async () => {
    const reader = makeReader({
      snapshots: {
        "v0.62.x": { [migrations("062/a.yaml")]: changelog("v62.a") },
      },
    });
    const result = await find({
      supportedMajors: [62],
      headFiles: { [migrations("063/a.yaml")]: changelog("v62.a", "v63.a") },
      reader,
    });

    expect(result).toEqual({ pending: {}, failures: {} });
  });

  it("only checks the changesets of each major against that major's release", async () => {
    const files = { [migrations("064/a.yaml")]: changelog("v64.a", "v65.a") };
    const reader = makeReader({
      snapshots: {
        "v0.64.x": { [migrations("064/a.yaml")]: changelog("v64.a") },
        "v0.65.x": files,
      },
    });
    const result = await find({
      supportedMajors: [65, 64],
      headFiles: files,
      reader,
    });

    expect(result).toEqual({ pending: {}, failures: {} });
  });

  it("checks the majors between the supported ones and up to the newest major on HEAD", async () => {
    const reader = makeReader({
      snapshots: { "v0.62.x": {}, "v0.63.x": {}, "v0.64.x": {}, "v0.65.x": {} },
    });
    const result = await find({
      supportedMajors: [64, 62],
      headFiles: {
        [migrations("063/a.yaml")]: changelog("v63.a"),
        [migrations("066/a.yaml")]: changelog("v66.a"),
      },
      reader,
    });

    expect(reader.trees).toHaveBeenCalledWith([
      "v0.62.x",
      "v0.63.x",
      "v0.64.x",
      "v0.65.x",
      "v0.66.x",
    ]);
    expect(Object.keys(result.pending)).toEqual(["63"]);
    expect(result.failures).toEqual({});
  });

  it("reports a reason for each released major that cannot be checked", async () => {
    const reader = makeReader({
      snapshots: { "v0.63.x": { [file]: unchanged } },
    });
    const result = await find({
      supportedMajors: [65, 63],
      headFiles: { [file]: unchanged },
      reader,
    });

    expect(result.failures).toEqual({
      64: "Could not read resources/migrations at v0.64.x",
      65: "Could not read resources/migrations at v0.65.x",
    });
  });
});

describe("createGithubReader", () => {
  it("sends one aliased query for many refs and maps the answers back", async () => {
    const github = {
      graphql: jest.fn(async () => ({
        r0: {
          object: {
            entries: [
              {
                path: "resources/migrations/001.yaml",
                oid: "a",
                type: "blob",
              },
              {
                path: "resources/migrations/063",
                oid: "t",
                type: "tree",
                object: {
                  entries: [
                    {
                      path: "resources/migrations/063/x.yaml",
                      oid: "b",
                      type: "blob",
                    },
                    {
                      path: "resources/migrations/063/x.sql",
                      oid: "c",
                      type: "blob",
                    },
                  ],
                },
              },
            ],
          },
        },
        r1: { object: null },
      })),
    };
    const reader = createGithubReader({
      github,
      owner: "metabase",
      repo: "metabase",
    });
    const trees = await reader.trees(["v0.63.x", "v0.64.x"]);

    expect(github.graphql).toHaveBeenCalledTimes(1);
    const [query, variables] = github.graphql.mock.calls[0];
    expect(query).toContain(
      'r0: repository(owner: $owner, name: $repo) { object(expression: "v0.63.x:resources/migrations")',
    );
    expect(query).toContain(
      'r1: repository(owner: $owner, name: $repo) { object(expression: "v0.64.x:resources/migrations")',
    );
    expect(variables).toEqual({ owner: "metabase", repo: "metabase" });
    expect(trees).toEqual(
      new Map([
        [
          "v0.63.x",
          new Map([
            ["resources/migrations/001.yaml", "a"],
            ["resources/migrations/063/x.yaml", "b"],
          ]),
        ],
        ["v0.64.x", null],
      ]),
    );
  });

  it("splits large requests into batches", async () => {
    const github = {
      graphql: jest.fn(async (query) =>
        Object.fromEntries(
          [...query.matchAll(/(r\d+): repository/g)].map(([, alias]) => [
            alias,
            { object: { text: alias, isTruncated: false } },
          ]),
        ),
      ),
    };
    const reader = createGithubReader({ github, owner: "o", repo: "r" });
    const locations = Array.from({ length: 120 }, (_, index) => ({
      ref: "v0.63.x",
      path: `f${index}.yaml`,
    }));
    const texts = await reader.blobTexts(locations);

    expect(github.graphql).toHaveBeenCalledTimes(3);
    expect(texts.size).toBe(120);
    expect(texts.get("v0.63.x:f119.yaml")).toBe("r19");
  });

  it("explains a failed request", async () => {
    const github = {
      graphql: jest.fn(async () => {
        throw new Error("Bad credentials");
      }),
    };
    const reader = createGithubReader({ github, owner: "o", repo: "r" });
    await expect(reader.trees(["v0.63.x"])).rejects.toThrow(
      "GitHub GraphQL request for resources/migrations trees failed: Bad credentials",
    );
  });

  it("refuses a truncated file", async () => {
    const github = {
      graphql: jest.fn(async () => ({
        r0: { object: { text: "partial", isTruncated: true } },
      })),
    };
    const reader = createGithubReader({ github, owner: "o", repo: "r" });
    await expect(
      reader.blobTexts([{ ref: "v0.63.x", path: "big.yaml" }]),
    ).rejects.toThrow("Could not read v0.63.x:big.yaml");
  });
});

describe("buildGatedCrossVersionMatrix", () => {
  const changeset = (major, id, status) => ({
    major,
    id,
    status,
    file: "a.yaml",
    commit: null,
  });

  it("returns the gated matrix, the skipped entries and the unreleased changesets", () => {
    const recent = changeset(63, "v63.a", "in-grace-period");
    const result = buildGatedCrossVersionMatrix({
      supportedMajors: [63, 62],
      pending: { 63: [recent] },
    });
    expect(result).toEqual({
      config: [
        { source: "HEAD", target: "v1.63.x" },
        { source: "v1.63.x", target: "HEAD" },
        { source: "v1.62.x", target: "HEAD" },
      ],
      skipped: [{ source: "HEAD", target: "v1.62.x" }],
      unreleased: [recent],
    });
  });

  it("does not skip or report changesets past the grace period", () => {
    const result = buildGatedCrossVersionMatrix({
      supportedMajors: [63, 62],
      pending: { 63: [changeset(63, "v63.a", "past-grace-period")] },
    });
    expect(result.skipped).toEqual([]);
    expect(result.unreleased).toEqual([]);
  });

  it("does not report changesets of the oldest major, which skip nothing", () => {
    const result = buildGatedCrossVersionMatrix({
      supportedMajors: [64, 63],
      pending: { 63: [changeset(63, "v63.a", "in-grace-period")] },
    });
    expect(result.skipped).toEqual([]);
    expect(result.unreleased).toEqual([]);
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
  const context = { sha: "head", repo: { owner: "o", repo: "r" } };
  const file = "resources/migrations/063/a.yaml";
  const headFiles = [{ path: file, oid: "new", text: "id: v63.a\n" }];
  const now = Date.parse("2026-10-19T12:00:00Z");

  const readerWith = ({ releaseText = "", fail = false } = {}) => ({
    trees: async (refs) => {
      if (fail) {
        throw new Error(
          "GitHub GraphQL request for resources/migrations trees failed: 502",
        );
      }
      return new Map(refs.map((ref) => [ref, new Map([[file, "old"]])]));
    },
    blobTexts: async (locations) =>
      new Map(
        locations.map(({ ref, path }) => [
          `${ref}:${path}`,
          ref === "commit" ? "id: v63.a\n" : releaseText,
        ]),
      ),
    histories: async (locations, since) =>
      new Map(
        locations.map(({ ref, path }) => [
          `${ref}:${path}`,
          historySince(
            [{ sha: "commit", date: "2026-10-18T12:00:00.000Z", prs: [] }],
            since,
          ),
        ]),
      ),
  });

  const generate = (options) =>
    generateCrossVersionMatrix({
      context,
      headFiles,
      graceDays: "3",
      now,
      ...options,
    });

  const output = (core, name) =>
    core.setOutput.mock.calls.find(([outputName]) => outputName === name)[1];

  it("sets the outputs and writes no summary when nothing is pending", async () => {
    const core = makeCore();
    await generate({
      core,
      supportedMajors: [63],
      reader: readerWith({ releaseText: "id: v63.a\n" }),
    });
    expect(output(core, "unreleased-changesets")).toBe("[]");
    expect(output(core, "matrix")).toBe(
      JSON.stringify({ include: buildCrossVersionMatrix([63]).config }),
    );
    expect(core.summary.write).not.toHaveBeenCalled();
  });

  it("warns and writes a summary when downgrades are skipped", async () => {
    const core = makeCore();
    await generate({ core, supportedMajors: [63, 62], reader: readerWith() });
    expect(core.warning).toHaveBeenCalledWith(
      "Skipping HEAD → v1.62.x: master has migrations that these releases do not have yet",
    );
    expect(core.summary.addList).toHaveBeenCalledWith(["HEAD → v1.62.x"]);
    expect(core.summary.write).toHaveBeenCalled();
    expect(JSON.parse(output(core, "unreleased-changesets"))).toEqual([
      expect.objectContaining({
        major: 63,
        id: "v63.a",
        status: "in-grace-period",
      }),
    ]);
  });

  it("uses the grace period it is given", async () => {
    const core = makeCore();
    await generate({
      core,
      supportedMajors: [63, 62],
      reader: readerWith(),
      graceDays: "0.5",
    });
    expect(output(core, "unreleased-changesets")).toBe("[]");
    expect(output(core, "matrix")).toBe(
      JSON.stringify({ include: buildCrossVersionMatrix([63, 62]).config }),
    );
  });

  it.each([undefined, "", "three", "-1"])(
    "fails with an explanation when the grace period is %p",
    async (graceDays) => {
      await expect(
        generate({
          core: makeCore(),
          supportedMajors: [63],
          reader: readerWith(),
          graceDays,
        }),
      ).rejects.toThrow(
        `Invalid grace period: ${JSON.stringify(graceDays)}. Set MIGRATION_GRACE_DAYS to a number of days.`,
      );
    },
  );

  it("explains a failed check, runs every downgrade and lists the failure in the summary", async () => {
    const core = makeCore();
    await generate({
      core,
      supportedMajors: [63, 62],
      reader: readerWith({ fail: true }),
    });
    expect(core.warning).toHaveBeenCalledWith(
      "Could not check v63 for unreleased migrations, so no downgrade is skipped for it: GitHub GraphQL request for resources/migrations trees failed: 502",
    );
    expect(output(core, "matrix")).toBe(
      JSON.stringify({ include: buildCrossVersionMatrix([63, 62]).config }),
    );
    expect(core.summary.addList).toHaveBeenCalledWith([
      "v62: GitHub GraphQL request for resources/migrations trees failed: 502",
      "v63: GitHub GraphQL request for resources/migrations trees failed: 502",
    ]);
    expect(core.summary.write).toHaveBeenCalled();
  });
});

describe("release notification", () => {
  const owner = "metabase";
  const repo = "metabase";
  const masterSha = "50e4cd4250ef7bd054b9a798267f06881424c7bc";
  const masterUrl = `https://github.com/metabase/metabase/commit/${masterSha}`;

  const masterCommit = {
    sha: masterSha,
    prs: [
      { number: 84259, url: "https://github.com/metabase/metabase/pull/84259" },
    ],
  };

  const changeset = (major, id, extra = {}) => ({
    major,
    id,
    status: "in-grace-period",
    file: "resources/migrations/063/x.yaml",
    commit: masterCommit,
    ...extra,
  });

  const context = { repo: { owner, repo }, runId: 1, sha: "head" };

  it("groups changesets by the master commit that added them", () => {
    const commits = groupByMasterCommit({
      changesets: [
        changeset(63, "v63.a"),
        changeset(63, "v63.b"),
        changeset(62, "v62.a"),
      ],
      warn: jest.fn(),
    });
    expect(commits).toEqual([
      {
        ...masterCommit,
        majors: [
          { major: 63, ids: ["v63.a", "v63.b"] },
          { major: 62, ids: ["v62.a"] },
        ],
      },
    ]);
  });

  it("warns about a changeset without a master commit", () => {
    const warn = jest.fn();
    const commits = groupByMasterCommit({
      changesets: [changeset(63, "v63.a", { commit: null })],
      warn,
    });
    expect(commits).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      "Could not find the master commit that added v63.a",
    );
  });

  it("links the master commit and its PR, and says how long downgrades are skipped", () => {
    const message = formatReleaseNeededMessage({
      owner,
      repo,
      runUrl: "https://run",
      graceDays: 3,
      commit: {
        ...masterCommit,
        majors: [
          { major: 63, ids: ["v63.a"] },
          { major: 62, ids: ["v62.a"] },
        ],
      },
    });
    expect(message).toBe(
      [
        `:warning: *<${masterUrl}|50e4cd4250> (<https://github.com/metabase/metabase/pull/84259|#84259>) breaks cross version tests!*`,
        "It added migrations `v63.a`, `v62.a` to master, but no release of v63, v62 has them yet. Please backport and release these changes!",
        "Cross-version downgrades from master to versions older than v63, v62 are skipped for 3 days after this commit. After that, they run again and fail until a release has these migrations. <https://run|Run>",
      ].join("\n"),
    );
  });

  it("sends one message per master commit", async () => {
    const sendSlackMessage = jest.fn(async () => ({}));
    const findSlackMessage = jest.fn(async () => null);
    await notifyReleaseNeeded({
      context,
      core: { warning: jest.fn() },
      changesets: [changeset(63, "v63.a"), changeset(63, "v63.b")],
      graceDays: "3",
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
      message: expect.stringContaining(
        "are skipped for 3 days after this commit",
      ),
    });
  });

  it("does not send a message when the channel already has one for the master commit", async () => {
    const sendSlackMessage = jest.fn();
    await notifyReleaseNeeded({
      context,
      core: { warning: jest.fn() },
      changesets: [changeset(63, "v63.a")],
      graceDays: "3",
      channelName: "release",
      findSlackMessage: jest.fn(async ({ text }) =>
        text === masterUrl ? { id: "1", body: "" } : null,
      ),
      sendSlackMessage,
    });
    expect(sendSlackMessage).not.toHaveBeenCalled();
  });
});
