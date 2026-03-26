import {
  getParameterSubType,
  getParameterType,
  isIdParameter,
} from "metabase-lib/v1/parameters/utils/parameter-type";

describe("parameters/utils/parameter-type", () => {
  describe("getParameterType", () => {
    it("should return the string before the slash in a parameter type", () => {
      expect(getParameterType({ type: "string/foo" })).toEqual("string");
      expect(getParameterType({ type: "category" })).toEqual("category");
    });

    it("should return the string before the slash in a parameter's type", () => {
      expect(getParameterType({ type: "string/foo" })).toEqual("string");
      expect(getParameterType({ type: "category" })).toEqual("category");
    });

    it("should prefer using a sectionId for determining the type if it exists", () => {
      expect(
        getParameterType({ sectionId: "location", type: "string/=" }),
      ).toEqual("location");
    });
  });

  describe("isIdParameter (QUE2-326)", () => {
    it("should return true for sectionId 'id' with concrete type", () => {
      expect(isIdParameter({ sectionId: "id", type: "number/=" })).toBe(true);
    });

    it("should return true for sectionId 'id' with string type", () => {
      expect(isIdParameter({ sectionId: "id", type: "string/=" })).toBe(true);
    });

    it("should return true for legacy type 'id' (backward compat)", () => {
      expect(isIdParameter({ type: "id" })).toBe(true);
    });

    it("should return false for non-id parameters", () => {
      expect(isIdParameter({ type: "number/=" })).toBe(false);
      expect(isIdParameter({ sectionId: "number", type: "number/=" })).toBe(
        false,
      );
    });
  });

  describe("getParameterSubType", () => {
    it("should return the string before the slash in a parameter type", () => {
      expect(getParameterSubType("string/foo")).toEqual("foo");
      expect(getParameterSubType("category")).toBeUndefined();
    });

    it("should return the string before the slash in a parameter's type", () => {
      expect(getParameterSubType("string/foo")).toEqual("foo");
      expect(getParameterSubType("category")).toBeUndefined();
    });
  });
});
