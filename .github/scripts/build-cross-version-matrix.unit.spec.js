const {
  buildCrossVersionMatrix,
  buildGatedCrossVersionMatrix,
  createGithubReader,
  excludeBlockedDowngrades,
  findUnreleasedChangesets,
  formatReleaseNeededMessage,
  generateCrossVersionMatrix,
  groupByMasterCommit,
  latestReleaseTag,
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

describe("latestReleaseTag", () => {
  it("picks the highest release tag of the major", () => {
    expect(
      latestReleaseTag(
        [
          "v0.63.9",
          "v0.63.20.1",
          "v0.63.20",
          "v0.63.x",
          "v0.63.20.x",
          "v0.630.1",
          "v0.63.2",
        ],
        63,
      ),
    ).toBe("v0.63.20.1");
  });

  it("prefers a release over the beta of the same version", () => {
    expect(latestReleaseTag(["v0.65.0-beta", "v0.65.0"], 65)).toBe("v0.65.0");
    expect(
      latestReleaseTag(["v0.65.0.6-beta", "v0.65.0-beta", "v0.65.x"], 65),
    ).toBe("v0.65.0.6-beta");
  });

  it("returns null when the major has no release tag", () => {
    expect(latestReleaseTag(["v0.66.x"], 66)).toBeNull();
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

  const makeReader = ({ tags, snapshots, histories = {} }) => {
    const reader = {
      tagNames: jest.fn(
        async (majors) => new Map(majors.map((major) => [major, tags])),
      ),
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
        async (locations) =>
          new Map(
            locations.map(({ ref, path }) => [
              `${ref}:${path}`,
              histories[`${ref}:${path}`] ?? [],
            ]),
          ),
      ),
    };
    return reader;
  };

  const headFilesOf = (files) =>
    Object.entries(files).map(([path, text]) => ({
      path,
      oid: oidOf(text),
      text,
    }));

  const unchanged = changelog("v63.old");
  const added = changelog("v63.old", "v63.new");

  it("finds nothing and reads no file contents when the release has the same files", async () => {
    const files = { [migrations("063/a.yaml")]: unchanged };
    const reader = makeReader({
      tags: ["v0.63.1"],
      snapshots: { "v0.63.1": files, "release-x.63.x": files },
    });
    const result = await findUnreleasedChangesets({
      supportedMajors: [63],
      headFiles: headFilesOf(files),
      headRef: "head",
      reader,
      now,
    });
    expect(result).toEqual({ pending: {}, failures: {} });
    expect(reader.blobTexts).toHaveBeenCalledWith([]);
    expect(reader.histories).not.toHaveBeenCalled();
  });

  it("marks a changeset that is on the release branch as awaiting-release, with its backport", async () => {
    const file = migrations("063/a.yaml");
    const reader = makeReader({
      tags: ["v0.63.1"],
      snapshots: {
        "v0.63.1": { [file]: unchanged },
        "release-x.63.x": { [file]: added },
        "master-commit": { [file]: added },
        "backport-commit": { [file]: added },
        "older-commit": { [file]: unchanged },
      },
      histories: {
        [`head:${file}`]: [
          {
            sha: "master-commit",
            committedDate: daysAgo(30),
            prs: [pr(1, "master"), pr(9, "release-x.63.x")],
          },
          { sha: "older-commit", committedDate: daysAgo(90), prs: [] },
        ],
        [`release-x.63.x:${file}`]: [
          {
            sha: "backport-commit",
            committedDate: daysAgo(2),
            prs: [pr(2, "release-x.63.x")],
          },
        ],
      },
    });
    const result = await findUnreleasedChangesets({
      supportedMajors: [63],
      headFiles: headFilesOf({ [file]: added }),
      headRef: "head",
      reader,
      now,
    });
    expect(result).toEqual({
      pending: {
        63: [
          {
            major: 63,
            id: "v63.new",
            file,
            status: "awaiting-release",
            commit: { sha: "master-commit", prs: [pr(1, "master")].map(link) },
            backport: {
              sha: "backport-commit",
              prs: [pr(2, "release-x.63.x")].map(link),
            },
          },
        ],
      },
      failures: {},
    });
  });

  it.each([
    [1, "awaiting-backport"],
    [5, "missing"],
  ])(
    "marks a changeset that reached master %i days ago and is not on the release branch as %s",
    async (days, status) => {
      const file = migrations("063/a.yaml");
      const reader = makeReader({
        tags: ["v0.63.1"],
        snapshots: {
          "v0.63.1": { [file]: unchanged },
          "release-x.63.x": { [file]: unchanged },
          "master-commit": { [file]: added },
        },
        histories: {
          [`head:${file}`]: [
            {
              sha: "master-commit",
              committedDate: daysAgo(days),
              prs: [pr(1, "master")],
            },
          ],
        },
      });
      const result = await findUnreleasedChangesets({
        supportedMajors: [63],
        headFiles: headFilesOf({ [file]: added }),
        headRef: "head",
        reader,
        now,
        graceDays: 3,
      });
      expect(result.pending[63]).toEqual([
        expect.objectContaining({ id: "v63.new", status, backport: null }),
      ]);
    },
  );

  it("marks a changeset as missing when no master commit added it", async () => {
    const file = migrations("063/a.yaml");
    const reader = makeReader({
      tags: ["v0.63.1"],
      snapshots: {
        "v0.63.1": { [file]: unchanged },
        "release-x.63.x": { [file]: unchanged },
      },
    });
    const result = await findUnreleasedChangesets({
      supportedMajors: [63],
      headFiles: headFilesOf({ [file]: added }),
      headRef: "head",
      reader,
      now,
    });
    expect(result.pending[63]).toEqual([
      expect.objectContaining({
        id: "v63.new",
        status: "missing",
        commit: null,
      }),
    ]);
  });

  it("finds a changeset that a release has in another file", async () => {
    const reader = makeReader({
      tags: ["v0.62.1"],
      snapshots: {
        "v0.62.1": { [migrations("062/a.yaml")]: changelog("v62.a") },
        "release-x.62.x": { [migrations("062/a.yaml")]: changelog("v62.a") },
      },
    });
    const result = await findUnreleasedChangesets({
      supportedMajors: [62],
      headFiles: headFilesOf({
        [migrations("063/a.yaml")]: changelog("v62.a", "v63.a"),
      }),
      headRef: "head",
      reader,
      now,
    });
    expect(result).toEqual({ pending: {}, failures: {} });
  });

  it("only checks the changesets of each major against that major's release", async () => {
    const file = migrations("064/a.yaml");
    const files = { [file]: changelog("v64.a", "v65.a") };
    const reader = makeReader({
      tags: ["v0.64.1", "v0.65.1"],
      snapshots: {
        "v0.64.1": { [file]: changelog("v64.a") },
        "release-x.64.x": { [file]: changelog("v64.a") },
        "v0.65.1": files,
        "release-x.65.x": files,
      },
    });
    const result = await findUnreleasedChangesets({
      supportedMajors: [65, 64],
      headFiles: headFilesOf(files),
      headRef: "head",
      reader,
      now,
    });
    expect(result).toEqual({ pending: {}, failures: {} });
  });

  it("checks the majors between the supported ones and up to the newest major on HEAD", async () => {
    const files = {
      [migrations("063/a.yaml")]: changelog("v63.a"),
      [migrations("066/a.yaml")]: changelog("v66.a"),
    };
    const reader = makeReader({
      tags: ["v0.62.1", "v0.63.1", "v0.64.1", "v0.65.1"],
      snapshots: Object.fromEntries(
        [62, 63, 64, 65].flatMap((major) => [
          [`v0.${major}.1`, {}],
          [`release-x.${major}.x`, {}],
        ]),
      ),
    });
    const result = await findUnreleasedChangesets({
      supportedMajors: [64, 62],
      headFiles: headFilesOf(files),
      headRef: "head",
      reader,
      now,
    });
    expect(reader.tagNames).toHaveBeenCalledWith([62, 63, 64, 65, 66]);
    expect(Object.keys(result.pending)).toEqual(["63"]);
    expect(result.failures).toEqual({});
  });

  it("reports a reason for each major that cannot be checked", async () => {
    const file = migrations("063/a.yaml");
    const reader = makeReader({
      tags: ["v0.63.1", "v0.64.1"],
      snapshots: { "v0.63.1": { [file]: unchanged } },
    });
    const result = await findUnreleasedChangesets({
      supportedMajors: [66, 64, 63],
      headFiles: headFilesOf({ [file]: unchanged }),
      headRef: "head",
      reader,
      now,
    });
    expect(result.failures).toEqual({
      66: "No v0.66.x release tag found",
      65: "No v0.65.x release tag found",
      64: "Could not read resources/migrations at v0.64.1",
      63: "Could not read resources/migrations at release-x.63.x",
    });
  });
});

function link({ number, url }) {
  return { number, url };
}

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
    const trees = await reader.trees(["v0.63.1", "release-x.63.x"]);

    expect(github.graphql).toHaveBeenCalledTimes(1);
    const [query, variables] = github.graphql.mock.calls[0];
    expect(query).toContain(
      'r0: repository(owner: $owner, name: $repo) { object(expression: "v0.63.1:resources/migrations")',
    );
    expect(query).toContain(
      'r1: repository(owner: $owner, name: $repo) { object(expression: "release-x.63.x:resources/migrations")',
    );
    expect(variables).toEqual({ owner: "metabase", repo: "metabase" });
    expect(trees).toEqual(
      new Map([
        [
          "v0.63.1",
          new Map([
            ["resources/migrations/001.yaml", "a"],
            ["resources/migrations/063/x.yaml", "b"],
          ]),
        ],
        ["release-x.63.x", null],
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
      ref: "v0.63.1",
      path: `f${index}.yaml`,
    }));
    const texts = await reader.blobTexts(locations);

    expect(github.graphql).toHaveBeenCalledTimes(3);
    expect(texts.size).toBe(120);
    expect(texts.get("v0.63.1:f119.yaml")).toBe("r19");
  });

  it("explains a failed request", async () => {
    const github = {
      graphql: jest.fn(async () => {
        throw new Error("Bad credentials");
      }),
    };
    const reader = createGithubReader({ github, owner: "o", repo: "r" });
    await expect(reader.tagNames([63])).rejects.toThrow(
      "GitHub GraphQL request for release tags failed: Bad credentials",
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
      reader.blobTexts([{ ref: "v0.63.1", path: "big.yaml" }]),
    ).rejects.toThrow("Could not read v0.63.1:big.yaml");
  });
});

describe("buildGatedCrossVersionMatrix", () => {
  const changeset = (major, id, status) => ({
    major,
    id,
    status,
    file: "a.yaml",
    commit: null,
    backport: null,
  });

  it("returns the gated matrix, the skipped entries and the unreleased changesets", () => {
    const awaitingRelease = changeset(63, "v63.a", "awaiting-release");
    const awaitingBackport = changeset(63, "v63.b", "awaiting-backport");
    const result = buildGatedCrossVersionMatrix({
      supportedMajors: [63, 62],
      pending: { 63: [awaitingRelease, awaitingBackport] },
    });
    expect(result).toEqual({
      config: [
        { source: "HEAD", target: "v1.63.x" },
        { source: "v1.63.x", target: "HEAD" },
        { source: "v1.62.x", target: "HEAD" },
      ],
      skipped: [{ source: "HEAD", target: "v1.62.x" }],
      unreleased: [awaitingRelease, awaitingBackport],
    });
  });

  it("does not skip or report missing changesets", () => {
    const result = buildGatedCrossVersionMatrix({
      supportedMajors: [63, 62],
      pending: { 63: [changeset(63, "v63.a", "missing")] },
    });
    expect(result.skipped).toEqual([]);
    expect(result.unreleased).toEqual([]);
  });

  it("does not report changesets of the oldest major, which skip nothing", () => {
    const result = buildGatedCrossVersionMatrix({
      supportedMajors: [64, 63],
      pending: { 63: [changeset(63, "v63.a", "awaiting-release")] },
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

  const readerWith = ({ releaseText = "", fail = false } = {}) => ({
    tagNames: async (majors) => {
      if (fail) {
        throw new Error("GitHub GraphQL request for release tags failed: 502");
      }
      return new Map(majors.map((major) => [major, [`v0.${major}.1`]]));
    },
    trees: async (refs) =>
      new Map(refs.map((ref) => [ref, new Map([[file, "old"]])])),
    blobTexts: async (locations) =>
      new Map(
        locations.map((location) => [
          `${location.ref}:${location.path}`,
          location.ref === "release-x.63.x" ? "id: v63.a\n" : releaseText,
        ]),
      ),
    histories: async (locations) =>
      new Map(
        locations.map((location) => [`${location.ref}:${location.path}`, []]),
      ),
  });

  it("sets the outputs and writes no summary when nothing is pending", async () => {
    const core = makeCore();
    await generateCrossVersionMatrix({
      core,
      context,
      supportedMajors: [63],
      headFiles,
      reader: readerWith({ releaseText: "id: v63.a\n" }),
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
      context,
      supportedMajors: [63, 62],
      headFiles,
      reader: readerWith(),
    });
    expect(core.warning).toHaveBeenCalledWith(
      "Skipping HEAD → v1.62.x: master has migrations that these releases do not have yet",
    );
    expect(core.summary.addList).toHaveBeenCalledWith(["HEAD → v1.62.x"]);
    expect(core.summary.write).toHaveBeenCalled();
    expect(
      JSON.parse(
        core.setOutput.mock.calls.find(
          ([name]) => name === "unreleased-changesets",
        )[1],
      ),
    ).toEqual([
      expect.objectContaining({
        major: 63,
        id: "v63.a",
        status: "awaiting-release",
      }),
    ]);
  });

  it("explains a failed check, runs every downgrade and lists the failure in the summary", async () => {
    const core = makeCore();
    await generateCrossVersionMatrix({
      core,
      context,
      supportedMajors: [63, 62],
      headFiles,
      reader: readerWith({ fail: true }),
    });
    expect(core.warning).toHaveBeenCalledWith(
      "Could not check v63 for unreleased migrations, so no downgrade is skipped for it: GitHub GraphQL request for release tags failed: 502",
    );
    expect(core.setOutput).toHaveBeenCalledWith(
      "matrix",
      JSON.stringify({ include: buildCrossVersionMatrix([63, 62]).config }),
    );
    expect(core.summary.addList).toHaveBeenCalledWith([
      "v62: GitHub GraphQL request for release tags failed: 502",
      "v63: GitHub GraphQL request for release tags failed: 502",
    ]);
    expect(core.summary.write).toHaveBeenCalled();
  });
});

describe("release notification", () => {
  const owner = "metabase";
  const repo = "metabase";
  const masterSha = "50e4cd4250ef7bd054b9a798267f06881424c7bc";
  const backportSha = "8ae0ae3ee3a0a349a4e48ba1aeb1a6891e694957";
  const masterUrl = `https://github.com/metabase/metabase/commit/${masterSha}`;

  const pr = (number) => ({
    number,
    url: `https://github.com/metabase/metabase/pull/${number}`,
  });

  const masterCommit = { sha: masterSha, prs: [pr(84259)] };
  const backport = { sha: backportSha, prs: [pr(84525)] };

  const changeset = (major, id, extra = {}) => ({
    major,
    id,
    status: "awaiting-release",
    file: "resources/migrations/063/x.yaml",
    commit: masterCommit,
    backport,
    ...extra,
  });

  const context = { repo: { owner, repo }, runId: 1, sha: "head" };

  it("groups changesets by the master commit that added them, with their backport", () => {
    const commits = groupByMasterCommit({
      changesets: [
        changeset(63, "v63.a"),
        changeset(63, "v63.b"),
        changeset(62, "v62.a", { backport: null }),
      ],
      warn: jest.fn(),
    });
    expect(commits).toEqual([
      {
        ...masterCommit,
        majors: [
          { major: 63, ids: ["v63.a", "v63.b"], backport },
          { major: 62, ids: ["v62.a"], backport: null },
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

  it("links the master commit, its PR and the backport in the message", () => {
    const message = formatReleaseNeededMessage({
      owner,
      repo,
      runUrl: "https://run",
      commit: {
        ...masterCommit,
        majors: [
          { major: 63, ids: ["v63.a"], backport },
          { major: 62, ids: ["v62.a"], backport: null },
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
      context,
      core: { warning: jest.fn() },
      changesets: [changeset(63, "v63.a"), changeset(63, "v63.b")],
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
      context,
      core: { warning: jest.fn() },
      changesets: [changeset(63, "v63.a")],
      channelName: "release",
      findSlackMessage: jest.fn(async ({ text }) =>
        text === masterUrl ? { id: "1", body: "" } : null,
      ),
      sendSlackMessage,
    });
    expect(sendSlackMessage).not.toHaveBeenCalled();
  });
});
