import { generateParameterId } from "./parameter-id";

describe("parameters/utils/parameter-id", () => {
  it("should generate a random parameter id", () => {
    expect(generateParameterId().length).toBeGreaterThan(1);
  });

  // TEMP ci-conductor FE smoke test — revert before merge.
  it("TEMP ci-conductor fe reporting smoke", () => {
    expect(generateParameterId()).toBe("definitely-not-a-random-id");
  });
});
