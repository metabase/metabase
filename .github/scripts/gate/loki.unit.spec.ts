import { planLoki } from "./loki";

const ARTIFACT_ID = "4242";

describe("planLoki", () => {
  it("plans nothing when the gate says the suite should not run", () => {
    expect(planLoki({ run: false })["visual-test"]).toBeNull();
  });

  it("runs every story when there is no usable plan", () => {
    const plan = planLoki({ run: true, testPlanArtifactId: ARTIFACT_ID });

    expect(plan["visual-test"]).toBe(true);
    expect(plan["test-plan-artifact-id"]).toBe("");
  });

  // A full selection is every story, so narrowing to it would only cost a second plan read.
  it("runs every story on a full selection", () => {
    const plan = planLoki({
      run: true,
      selection: "full",
      testPlanArtifactId: ARTIFACT_ID,
    });

    expect(plan["visual-test"]).toBe(true);
    expect(plan["test-plan-artifact-id"]).toBe("");
  });

  it("passes the plan on for a narrowed selection", () => {
    const plan = planLoki({
      run: true,
      selection: "narrowed",
      testPlanArtifactId: ARTIFACT_ID,
    });

    expect(plan["visual-test"]).toBe(true);
    expect(plan["test-plan-artifact-id"]).toBe(ARTIFACT_ID);
  });

  it("skips the visual test when the plan selected no stories", () => {
    const plan = planLoki({
      run: true,
      selection: "empty",
      testPlanArtifactId: ARTIFACT_ID,
    });

    expect(plan["visual-test"]).toBeNull();
    expect(plan["test-plan-artifact-id"]).toBe("");
  });

  // The gate only reads the selection when the suite runs, but a force-skip must win regardless.
  it("keeps the suite out on a force-skip whatever the selection", () => {
    const plan = planLoki({
      run: false,
      selection: "narrowed",
      testPlanArtifactId: ARTIFACT_ID,
    });

    expect(plan["visual-test"]).toBeNull();
    expect(plan["test-plan-artifact-id"]).toBe("");
  });
});
