import path from "path";

import glob from "glob";

import { elements } from "../module-boundaries.mjs";
import { assertSharedTierCoverage } from "../shared-tiers.mjs";

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
  const elements = [
    { type: "shared/tiered" },
    { type: "shared/legacy" },
    { type: "feature/screen" },
  ];
  const assignments = {
    tiered: ["shared/tiered"],
    untiered: ["shared/legacy"],
  };

  it("accepts tiered modules and explicit migration exceptions", () => {
    expect(() => assertSharedTierCoverage(elements, assignments)).not.toThrow();
  });

  it("accepts several element patterns belonging to one shared module", () => {
    expect(() =>
      assertSharedTierCoverage(
        [...elements, { type: "shared/tiered" }],
        assignments,
      ),
    ).not.toThrow();
  });

  it("rejects a new shared module without a tier even if its enforcement is disabled", () => {
    expect(() =>
      assertSharedTierCoverage(
        [...elements, { type: "shared/new", enforceSharedTiers: false }],
        assignments,
      ),
    ).toThrow("Shared module shared/new is missing a tier assignment");
  });

  it("requires removing the exception when a module gets a tier", () => {
    expect(() =>
      assertSharedTierCoverage(elements, {
        ...assignments,
        tiered: [...assignments.tiered, "shared/legacy"],
      }),
    ).toThrow(
      "Tiered module shared/legacy must be removed from the untiered allowlist",
    );
  });

  it.each([
    ["tiered", "tier lists"],
    ["untiered", "untiered allowlist"],
  ])("rejects stale entries in %s", (key, label) => {
    expect(() =>
      assertSharedTierCoverage(elements, {
        ...assignments,
        [key]: [...assignments[key], "shared/deleted"],
      }),
    ).toThrow(`Unknown shared module shared/deleted in ${label}`);
  });

  it.each([
    ["tiered", "tier lists", "shared/tiered"],
    ["untiered", "untiered allowlist", "shared/legacy"],
  ])("rejects duplicate assignments in %s", (key, label, type) => {
    expect(() =>
      assertSharedTierCoverage(elements, {
        ...assignments,
        [key]: [...assignments[key], type],
      }),
    ).toThrow(`Duplicate ${type} in ${label}`);
  });

  it("rejects assigning a shared tier to a non-shared element", () => {
    expect(() =>
      assertSharedTierCoverage(elements, {
        ...assignments,
        tiered: [...assignments.tiered, "feature/screen"],
      }),
    ).toThrow("Unknown shared module feature/screen in tier lists");
  });
});
