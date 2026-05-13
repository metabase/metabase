import { buildAutoReleaseSkipMessage } from "./slack";

describe("buildAutoReleaseSkipMessage", () => {
  const baseArgs = {
    majorVersion: 54,
    runId: "12345",
    owner: "metabase",
    repo: "metabase",
  };

  const runLink = "<https://github.com/metabase/metabase/actions/runs/12345|workflow run>";

  describe("patch", () => {
    const patchArgs = { ...baseArgs, kind: "patch" as const };

    it("uses a failure emoji for no-green-commit", () => {
      const message = buildAutoReleaseSkipMessage({ ...patchArgs, reason: "no-green-commit" });

      expect(message).toContain(":x:");
      expect(message).toContain("Auto-patch");
      expect(message).toContain("v54");
      expect(message).toContain("no commit found suitable for the release");
      expect(message).toContain(runLink);
    });

    it("uses a failure emoji for no-next-version (patch can't fall back to manual)", () => {
      const message = buildAutoReleaseSkipMessage({ ...patchArgs, reason: "no-next-version" });

      expect(message).toContain(":x:");
      expect(message).toContain("Auto-patch");
      expect(message).toContain("next patch version");
      expect(message).toContain(runLink);
    });

    it("uses an info emoji (not a failure emoji) for already-released", () => {
      const message = buildAutoReleaseSkipMessage({ ...patchArgs, reason: "already-released" });

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
      const message = buildAutoReleaseSkipMessage({ ...minorArgs, reason: "no-green-commit" });

      expect(message).toContain(":x:");
      expect(message).toContain("Auto-minor");
      expect(message).toContain("v54");
      expect(message).toContain("no commit found suitable for the release");
      expect(message).toContain(runLink);
    });

    it("uses an info emoji for no-next-version (gold release happens manually)", () => {
      const message = buildAutoReleaseSkipMessage({ ...minorArgs, reason: "no-next-version" });

      expect(message).toContain(":information_source:");
      expect(message).not.toContain(":x:");
      expect(message).toContain("Auto-minor");
      expect(message).toContain("no gold release yet");
      expect(message).toContain(runLink);
    });

    it("uses an info emoji (not a failure emoji) for already-released", () => {
      const message = buildAutoReleaseSkipMessage({ ...minorArgs, reason: "already-released" });

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
