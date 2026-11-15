import { hasCommitBeenReleased } from "./github";

// release-x.61.x window for these tests: lastTagSha is at index 0 (oldest),
// branch tip at the end. Commits NEWER than lastTagSha are those after it.
const LAST_TAG_SHA = "aaaa".repeat(10);
const PARENT_OF_LAST = "0000".repeat(10);
const NEWER_1 = "bbbb".repeat(10);
const NEWER_2 = "cccc".repeat(10);

const NEW_COMMITS_LIST = [{ sha: NEWER_1 }, { sha: NEWER_2 }];

describe("hasCommitBeenReleased", () => {
  const build = ({
    lastTag = "v0.61.2.7",
    commits = NEW_COMMITS_LIST,
  }: { lastTag?: string; commits?: Array<{ sha: string }> } = {}) => ({
    paginate: jest.fn().mockResolvedValue([{ ref: `refs/tags/${lastTag}` }]),
    rest: {
      git: {
        getRef: jest
          .fn()
          .mockResolvedValue({ data: { object: { sha: LAST_TAG_SHA } } }),
      },
      repos: {
        compareCommitsWithBasehead: jest
          .fn()
          .mockResolvedValue({ data: { commits } }),
      },
    },
  });

  const call = (github: ReturnType<typeof build>, ref: string) =>
    hasCommitBeenReleased({
      github: github as any,
      owner: "metabase",
      repo: "metabase",
      ref,
      majorVersion: 61,
    });

  it("returns false when the candidate is newer than the last release", async () => {
    await expect(call(build(), NEWER_2)).resolves.toBe(false);
  });

  // The DEV-2025 regression: the candidate is an ancestor of the last release
  // tag (e.g. green commit older than a manual/override release). It must be
  // treated as already released — the previous SHA-equality check missed this.
  it("returns true when the candidate is older than the last release", async () => {
    await expect(call(build(), PARENT_OF_LAST)).resolves.toBe(true);
  });

  it("short-circuits when the candidate IS the last release tag's commit", async () => {
    const github = build();
    await expect(call(github, LAST_TAG_SHA)).resolves.toBe(true);
    expect(github.rest.repos.compareCommitsWithBasehead).not.toHaveBeenCalled();
  });

  it("compares against the release branch tip for the given major", async () => {
    const github = build();
    await call(github, NEWER_1);

    expect(github.rest.repos.compareCommitsWithBasehead).toHaveBeenCalledWith(
      expect.objectContaining({
        basehead: `${LAST_TAG_SHA}...refs/heads/release-x.61.x`,
      }),
    );
  });
});
