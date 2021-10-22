import { getParameterType, getParameterSubType } from "./parameter-type";

describe("parameters/utils/parameter-type", () => {
  describe("getParameterType", () => {
    it("should return the string before the slash in a parameter type", () => {
      expect(getParameterType("string/foo")).toEqual("string");
      expect(getParameterType("category")).toEqual("category");
    });
  });

  describe("getParameterSubType", () => {
    it("should return the string after the slash in a parameter type", () => {
      expect(getParameterSubType("string/foo")).toEqual("foo");
      expect(getParameterSubType("category")).toBeUndefined();
    });
  });
});
