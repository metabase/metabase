import { hasCommitBeenReleased } from "./github";

const LAST_TAG_SHA = "aaaa".repeat(10);
const CANDIDATE_SHA = "bbbb".repeat(10);

type CompareStatus = "ahead" | "behind" | "identical" | "diverged";

describe("hasCommitBeenReleased", () => {
  const build = (status: CompareStatus) => ({
    paginate: jest
      .fn()
      .mockResolvedValue([{ ref: "refs/tags/v0.61.2.7" }]),
    rest: {
      git: {
        getRef: jest
          .fn()
          .mockResolvedValue({ data: { object: { sha: LAST_TAG_SHA } } }),
      },
      repos: {
        compareCommitsWithBasehead: jest
          .fn()
          .mockResolvedValue({ data: { status } }),
      },
    },
  });

  const call = (github: ReturnType<typeof build>) =>
    hasCommitBeenReleased({
      github: github as any,
      owner: "metabase",
      repo: "metabase",
      ref: CANDIDATE_SHA,
      majorVersion: 61,
    });

  it("returns false when the candidate is ahead of the last release", async () => {
    await expect(call(build("ahead"))).resolves.toBe(false);
  });

  // The DEV-2025 regression: the candidate is behind the last release tag
  // (e.g. green commit older than a manual/override release). It must be
  // treated as already released — the previous SHA-equality check missed this.
  it.each<CompareStatus>(["behind", "identical", "diverged"])(
    "returns true when the candidate is %s relative to the last release",
    async status => {
      await expect(call(build(status))).resolves.toBe(true);
    },
  );

  it("compares the last release tag's commit directly against the candidate", async () => {
    const github = build("ahead");
    await call(github);

    expect(github.rest.repos.compareCommitsWithBasehead).toHaveBeenCalledWith(
      expect.objectContaining({
        basehead: `${LAST_TAG_SHA}...${CANDIDATE_SHA}`,
      }),
    );
  });
});
