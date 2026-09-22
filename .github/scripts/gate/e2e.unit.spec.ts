import { planE2e } from "./e2e";

const SPECS = [
  "e2e/test/scenarios/onboarding/command-palette.cy.spec.js",
  "e2e/test/scenarios/question/document-title.cy.spec.js",
];

// A spec change matches e2e_specs and, through it, e2e_all.
const specsOnly = { e2e_all: SPECS, e2e_specs: SPECS };

describe("planE2e", () => {
  it("plans nothing when the gate says the suite should not run", () => {
    expect(planE2e({ run: false })["e2e-tests"]).toBeNull();
  });

  it("runs every spec when the diff reached past the specs", () => {
    const plan = planE2e({
      run: true,
      pullRequest: true,
      files: { e2e_all: [...SPECS, "src/metabase/api/card.clj"], e2e_specs: SPECS },
    });

    expect(plan["e2e-tests"]).toBe(true);
    expect(plan.specs).toBe("");
  });

  it("narrows to the changed specs when a pull request changed nothing else", () => {
    const plan = planE2e({ run: true, pullRequest: true, files: specsOnly });

    expect(plan.specs).toBe(SPECS.join(","));
  });

  // A force-run reports every filter as matched, so the two lists agreeing proves nothing.
  it("runs every spec on a force-run", () => {
    const plan = planE2e({
      run: true,
      forceRun: true,
      pullRequest: true,
      files: specsOnly,
    });

    expect(plan.specs).toBe("");
  });

  it("runs every spec on a push, whatever the diff touched", () => {
    const plan = planE2e({ run: true, files: specsOnly });

    expect(plan.specs).toBe("");
  });

  it("runs every spec when the gate reported no files at all", () => {
    const plan = planE2e({ run: true, pullRequest: true });

    expect(plan["e2e-tests"]).toBe(true);
    expect(plan.specs).toBe("");
  });

  // Order comes from the paths filter, so two lists of the same specs in a different order are not
  // the same change and the suite stays wide rather than guessing.
  it("runs every spec when the two file lists disagree on order", () => {
    const plan = planE2e({
      run: true,
      pullRequest: true,
      files: { e2e_all: SPECS, e2e_specs: [...SPECS].reverse() },
    });

    expect(plan.specs).toBe("");
  });
});
