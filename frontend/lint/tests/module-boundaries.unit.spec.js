import path from "path";

import glob from "glob";

import { elements } from "../module-boundaries.mjs";
import { TIERED_SHARED } from "../shared-tiers.mjs";

const REPO_ROOT = path.resolve(__dirname, "../../..");

describe("module-boundaries elements", () => {
  it("every element pattern matches at least one file", () => {
    const stale = elements
      .filter(
        (element) =>
          glob.sync(element.pattern, {
            cwd: REPO_ROOT,
            dot: true,
            nodir: true,
          }).length === 0,
      )
      .map((element) => `${element.type} -> ${element.pattern}`);

    expect(stale).toEqual([]);
  });
});

describe("shared tier coverage", () => {
  // A shared module can have multiple element patterns.
  const sharedTypes = new Set(
    elements
      .map(({ type }) => type)
      .filter((type) => type.startsWith("shared/")),
  );

  it("only leaves the existing migration backlog untiered", () => {
    // Only shrink this list: new shared modules must have a tier.
    expect(
      [...sharedTypes].filter((type) => !TIERED_SHARED.includes(type)).sort(),
    ).toEqual([
      "shared/common",
      "shared/embedding",
      "shared/embedding-sdk",
      "shared/embedding-sdk-shared",
      "shared/embedding-sdk-window-bridge",
    ]);
  });

  it("assigns each tiered module exactly once", () => {
    expect(TIERED_SHARED.length).toBe(new Set(TIERED_SHARED).size);
  });

  it("only assigns tiers to existing shared modules", () => {
    expect(TIERED_SHARED.filter((type) => !sharedTypes.has(type))).toEqual([]);
  });
});
