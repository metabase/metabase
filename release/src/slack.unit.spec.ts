import { buildAutoPatchSkipMessage } from "./slack";

describe("buildAutoPatchSkipMessage", () => {
  const baseArgs = {
    majorVersion: 54,
    runId: "12345",
    owner: "metabase",
    repo: "metabase",
  };

  const runLink = "<https://github.com/metabase/metabase/actions/runs/12345|workflow run>";

  it("uses a failure emoji for no-green-commit", () => {
    const message = buildAutoPatchSkipMessage({ ...baseArgs, reason: "no-green-commit" });

    expect(message).toContain(":x:");
    expect(message).toContain("v54");
    expect(message).toContain("no commit found suitable for the release");
    expect(message).toContain(runLink);
  });

  it("uses a failure emoji for no-next-patch", () => {
    const message = buildAutoPatchSkipMessage({ ...baseArgs, reason: "no-next-patch" });

    expect(message).toContain(":x:");
    expect(message).toContain("v54");
    expect(message).toContain("next patch version");
    expect(message).toContain(runLink);
  });

  it("uses an info emoji (not a failure emoji) for already-released", () => {
    const message = buildAutoPatchSkipMessage({ ...baseArgs, reason: "already-released" });

    expect(message).toContain(":information_source:");
    expect(message).not.toContain(":x:");
    expect(message).toContain("v54");
    expect(message).toContain("nothing new to patch");
    expect(message).toContain(runLink);
  });

  it("uses the provided major version in the message", () => {
    const message = buildAutoPatchSkipMessage({
      ...baseArgs,
      majorVersion: 53,
      reason: "no-green-commit",
    });

    expect(message).toContain("v53");
    expect(message).not.toContain("v54");
  });
});
