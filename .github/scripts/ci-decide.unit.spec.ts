import { decide } from "./ci-decide";

describe("decide", () => {
  it.each(["master", "release-x.55.x", "release-x.41.4", "release-x.60.x"])(
    "force-runs on %s",
    (ref) => {
      expect(decide({ ref, tags: [] })).toEqual({
        verdict: "force-run",
        reason: `${ref} is a protected branch`,
      });
    },
  );

  it.each(["my-pr-2", "release-metrics", "release-0.36.x", "master-ish"])(
    "defers on %s",
    (ref) => {
      expect(decide({ ref, tags: [] }).verdict).toBe("defer");
    },
  );

  it("force-runs on ci:run-all", () => {
    expect(decide({ ref: "my-pr-2", tags: ["ci:run-all"] }).verdict).toBe(
      "force-run",
    );
  });

  it("force-skips on ci:skip", () => {
    expect(decide({ ref: "my-pr-2", tags: ["ci:skip"] }).verdict).toBe(
      "force-skip",
    );
  });

  it("resolves the run-all/skip collision toward running", () => {
    expect(
      decide({ ref: "my-pr-2", tags: ["ci:run-all", "ci:skip"] }).verdict,
    ).toBe("force-run");
  });

  it("keeps a protected ref un-skippable", () => {
    expect(decide({ ref: "master", tags: ["ci:skip"] }).verdict).toBe(
      "force-run",
    );
  });

  it("ignores tags it doesn't own", () => {
    expect(decide({ ref: "my-pr-2", tags: ["backport"] }).verdict).toBe(
      "defer",
    );
  });
});
