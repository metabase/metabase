import { generateParameterId } from "./parameter-id";

describe("parameters/utils/parameter-id", () => {
  it("should generate a random parameter id", () => {
    expect(generateParameterId().length).toBeGreaterThan(1);
  });
});
