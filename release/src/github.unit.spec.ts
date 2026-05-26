import {
  compareCommits,
  getLastReleaseCommit,
  getLatestGreenCommit,
} from "./github";

// 95 passing checks clears the MIN_TOTAL_CHECKS gate in checksPassed
const passingChecks = Array.from({ length: 95 }, () => ({
  conclusion: "success",
  status: "completed",
  head_sha: "x",
}));

describe("github", () => {
  describe("compareCommits", () => {
    const build = (status: string) => ({
      rest: {
        repos: {
          compareCommitsWithBasehead: jest
            .fn()
            .mockResolvedValue({ data: { status } }),
        },
      },
    });

    it("returns the GitHub comparison status and builds base...head", async () => {
      const github = build("ahead");

      await expect(
        compareCommits({
          github: github as any,
          owner: "metabase",
          repo: "metabase",
          base: "a".repeat(40),
          head: "b".repeat(40),
        }),
      ).resolves.toBe("ahead");

      expect(github.rest.repos.compareCommitsWithBasehead).toHaveBeenCalledWith(
        expect.objectContaining({
          basehead: `${"a".repeat(40)}...${"b".repeat(40)}`,
        }),
      );
    });
  });

  describe("getLastReleaseCommit", () => {
    const build = ({
      lastTag,
      sha = "c".repeat(40),
    }: {
      lastTag: string | null;
      sha?: string;
    }) => ({
      paginate: jest
        .fn()
        .mockResolvedValue(lastTag ? [{ ref: `refs/tags/${lastTag}` }] : []),
      rest: {
        git: {
          getRef: jest
            .fn()
            .mockResolvedValue({ data: { object: { sha } } }),
        },
      },
    });

    it("resolves the most recent release tag to its commit sha", async () => {
      const github = build({ lastTag: "v0.61.2.7" });

      await expect(
        getLastReleaseCommit({
          github: github as any,
          owner: "metabase",
          repo: "metabase",
          majorVersion: 61,
        }),
      ).resolves.toBe("c".repeat(40));
    });

    it("returns null when the major has never been released", async () => {
      const github = build({ lastTag: null });

      await expect(
        getLastReleaseCommit({
          github: github as any,
          owner: "metabase",
          repo: "metabase",
          majorVersion: 61,
        }),
      ).resolves.toBeNull();
      expect(github.rest.git.getRef).not.toHaveBeenCalled();
    });
  });

  describe("getLatestGreenCommit", () => {
    // The window compare returns commits oldest-first; getLatestGreenCommit
    // reverses to newest-first. "new" is the branch tip, "old" its parent.
    const build = ({
      ancestryStatus,
    }: {
      ancestryStatus?: string;
    } = {}) => ({
      paginate: jest.fn().mockResolvedValue(passingChecks),
      rest: {
        repos: {
          compareCommitsWithBasehead: jest.fn(async ({ basehead }: any) => {
            // window scan: branch~10...branch
            if (basehead.includes("~")) {
              return { data: { commits: [{ sha: "old" }, { sha: "new" }] } };
            }
            // freshness ancestry: sinceCommit...candidate
            return { data: { status: ancestryStatus } };
          }),
        },
        checks: { listForRef: jest.fn() },
      },
    });

    const run = (github: ReturnType<typeof build>, sinceCommit?: string | null) =>
      getLatestGreenCommit({
        github: github as any,
        owner: "metabase",
        repo: "metabase",
        branch: "release-x.61.x",
        sinceCommit,
      });

    it("returns the newest green commit when no baseline is given (legacy)", async () => {
      const github = build();

      await expect(run(github)).resolves.toBe("new");
    });

    it("returns the newest green commit when it is ahead of the last release", async () => {
      const github = build({ ancestryStatus: "ahead" });

      await expect(run(github, "since-sha")).resolves.toBe("new");
    });

    // The core regression: the newest green commit is an ancestor of the last
    // release (e.g. after a manual/override release from a not-yet-green tip).
    // It must NOT be offered as a release candidate.
    it.each(["identical", "behind", "diverged"])(
      "returns null when the newest green commit is %s relative to the last release",
      async status => {
        const github = build({ ancestryStatus: status });

        await expect(run(github, "since-sha")).resolves.toBeNull();
      },
    );
  });
});
