import {
  buildAutoReleaseSkipMessage,
  formatJobResults,
  getReleaseThreadKey,
  getReleaseThreadTitle,
} from "./slack";

describe("buildAutoReleaseSkipMessage", () => {
  const baseArgs = {
    majorVersion: 54,
    runId: "12345",
    owner: "metabase",
    repo: "metabase",
  };

  const runLink =
    "<https://github.com/metabase/metabase/actions/runs/12345|workflow run>";

  describe("patch", () => {
    const patchArgs = { ...baseArgs, kind: "patch" as const };

    it("uses a failure emoji for no-green-commit", () => {
      const message = buildAutoReleaseSkipMessage({
        ...patchArgs,
        reason: "no-green-commit",
      });

      expect(message).toContain(":x:");
      expect(message).toContain("Auto-patch");
      expect(message).toContain("v54");
      expect(message).toContain("no commit found suitable for the release");
      expect(message).toContain(runLink);
    });

    it("uses a failure emoji for no-next-version (patch can't fall back to manual)", () => {
      const message = buildAutoReleaseSkipMessage({
        ...patchArgs,
        reason: "no-next-version",
      });

      expect(message).toContain(":x:");
      expect(message).toContain("Auto-patch");
      expect(message).toContain("next patch version");
      expect(message).toContain(runLink);
    });

    it("uses an info emoji (not a failure emoji) for already-released", () => {
      const message = buildAutoReleaseSkipMessage({
        ...patchArgs,
        reason: "already-released",
      });

      expect(message).toContain(":information_source:");
      expect(message).not.toContain(":x:");
      expect(message).toContain("Auto-patch");
      expect(message).toContain("nothing new to patch");
      expect(message).toContain(runLink);
    });
  });

  describe("minor", () => {
    const minorArgs = { ...baseArgs, kind: "minor" as const };

    it("uses a failure emoji for no-green-commit", () => {
      const message = buildAutoReleaseSkipMessage({
        ...minorArgs,
        reason: "no-green-commit",
      });

      expect(message).toContain(":x:");
      expect(message).toContain("Auto-minor");
      expect(message).toContain("v54");
      expect(message).toContain("no commit found suitable for the release");
      expect(message).toContain(runLink);
    });

    it("uses an info emoji for no-next-version (gold release happens manually)", () => {
      const message = buildAutoReleaseSkipMessage({
        ...minorArgs,
        reason: "no-next-version",
      });

      expect(message).toContain(":information_source:");
      expect(message).not.toContain(":x:");
      expect(message).toContain("Auto-minor");
      expect(message).toContain("no gold release yet");
      expect(message).toContain(runLink);
    });

    it("uses an info emoji (not a failure emoji) for already-released", () => {
      const message = buildAutoReleaseSkipMessage({
        ...minorArgs,
        reason: "already-released",
      });

      expect(message).toContain(":information_source:");
      expect(message).not.toContain(":x:");
      expect(message).toContain("Auto-minor");
      expect(message).toContain("nothing new to ship");
      expect(message).toContain(runLink);
    });
  });

  it("uses the provided major version in the message", () => {
    const message = buildAutoReleaseSkipMessage({
      ...baseArgs,
      kind: "patch",
      majorVersion: 53,
      reason: "no-green-commit",
    });

    expect(message).toContain("v53");
    expect(message).not.toContain("v54");
  });
});

describe("formatJobResults", () => {
  it("lists failed and cancelled jobs", () => {
    const needs = JSON.stringify({
      "check-version": { result: "success", outputs: {} },
      "push-tags": { result: "failure", outputs: {} },
      "containerize-ee": { result: "cancelled", outputs: {} },
      "add-extra-tags": { result: "failure", outputs: {} },
      "publish-version-info": { result: "skipped", outputs: {} },
    });

    expect(formatJobResults(needs)).toBe(
      "Failed: `push-tags`, `add-extra-tags`. Cancelled: `containerize-ee`",
    );
  });

  it("lists only failed jobs when none are cancelled", () => {
    const needs = JSON.stringify({
      "copy-to-s3": { result: "failure" },
      "push-git-tags": { result: "success" },
    });

    expect(formatJobResults(needs)).toBe("Failed: `copy-to-s3`");
  });

  it("returns an empty string when no job failed or was cancelled", () => {
    expect(formatJobResults(JSON.stringify({ a: { result: "success" } }))).toBe(
      "",
    );
    expect(formatJobResults("{}")).toBe("");
  });

  it("returns an empty string for missing or invalid input", () => {
    expect(formatJobResults()).toBe("");
    expect(formatJobResults("")).toBe("");
    expect(formatJobResults("not json")).toBe("");
    expect(formatJobResults("null")).toBe("");
  });
});

describe("release thread", () => {
  const commit = "0123456789abcdef0123456789abcdef01234567";

  it("puts the version and the short commit in a bold title", () => {
    expect(getReleaseThreadTitle({ version: "v1.64.5.5", commit })).toBe(
      ":rocket: *64.5.5 Release | 0123456* :rocket:",
    );
  });

  it("finds the thread by commit, not by version", () => {
    const key = getReleaseThreadKey(commit);

    expect(getReleaseThreadTitle({ version: "v1.64.5.5", commit })).toContain(
      key,
    );
    expect(getReleaseThreadTitle({ version: "v1.64.5.6", commit })).toContain(
      key,
    );
    expect(
      getReleaseThreadTitle({
        version: "v1.64.5.5",
        commit: "fedcba9876543210fedcba9876543210fedcba98",
      }),
    ).not.toContain(key);
  });

  it("does not match the release commit link in the thread body", () => {
    expect(
      `<https://github.com/metabase/metabase/commit/${commit}|_:merged: Release Commit_>`,
    ).not.toContain(getReleaseThreadKey(commit));
  });
});
