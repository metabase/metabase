import { getVisibleParameters } from "./get-visible-parameters";

describe("getVisibleParameters", () => {
  describe("when lockedParameters is undefined or empty", () => {
    it.each([
      {
        parameters: { param1: "value1", param2: "value2" },
        lockedParameters: undefined,
        description: "undefined locked parameters",
        expected: { param1: "value1", param2: "value2" },
      },
      {
        parameters: { param1: "value1", param2: "value2" },
        lockedParameters: [],
        description: "empty locked parameters array",
        expected: { param1: "value1", param2: "value2" },
      },
    ])(
      "should return original parameters when $description",
      ({ parameters, lockedParameters, expected }) => {
        const result = getVisibleParameters(parameters, lockedParameters);

        expect(result).toEqual(expected);
      },
    );
  });

  describe("when filtering parameters", () => {
    it.each([
      {
        parameters: { param1: "value1", param2: "value2", param3: "value3" },
        lockedParameters: ["param2"],
        description: "one locked parameter out of three",
        expected: { param1: "value1", param3: "value3" },
      },
      {
        parameters: { param1: "value1", param2: "value2", param3: "value3" },
        lockedParameters: ["param1", "param3"],
        description: "two locked parameters out of three",
        expected: { param2: "value2" },
      },
      {
        parameters: { param1: "value1", param2: "value2" },
        lockedParameters: ["param3"],
        description: "locked parameter not in parameters",
        expected: { param1: "value1", param2: "value2" },
      },
      {
        parameters: { param1: "value1", param2: "value2" },
        lockedParameters: ["param3", "param4"],
        description: "multiple locked parameters not in parameters",
        expected: { param1: "value1", param2: "value2" },
      },
    ])(
      "should return filtered parameters when $description",
      ({ parameters, lockedParameters, expected }) => {
        const result = getVisibleParameters(parameters, lockedParameters);

        expect(result).toEqual(expected);
      },
    );
  });

  describe("when all parameters are locked", () => {
    it("should return undefined when all parameters are locked", () => {
      const parameters = { param1: "value1", param2: "value2" };
      const lockedParameters = ["param1", "param2"];

      const result = getVisibleParameters(parameters, lockedParameters);

      expect(result).toBeUndefined();
    });
  });
});
