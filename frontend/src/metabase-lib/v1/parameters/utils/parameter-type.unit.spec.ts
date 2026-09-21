import {
  getParameterSubType,
  getParameterType,
  isIdParameter,
} from "metabase-lib/v1/parameters/utils/parameter-type";
import { createMockParameter } from "metabase-types/api/mocks";

describe("parameters/utils/parameter-type", () => {
  describe("getParameterType", () => {
    it("should return the string before the slash in a parameter type", () => {
      expect(
        getParameterType(createMockParameter({ type: "string/foo" })),
      ).toEqual("string");
      expect(
        getParameterType(createMockParameter({ type: "category" })),
      ).toEqual("category");
    });

    it("should return the string before the slash in a parameter's type", () => {
      expect(
        getParameterType(createMockParameter({ type: "string/foo" })),
      ).toEqual("string");
      expect(
        getParameterType(createMockParameter({ type: "category" })),
      ).toEqual("category");
    });

    it("should prefer using a sectionId for determining the type if it exists", () => {
      expect(
        getParameterType(
          createMockParameter({ sectionId: "location", type: "string/=" }),
        ),
      ).toEqual("location");
    });
  });

  describe("isIdParameter (QUE2-326)", () => {
    it("should return true for sectionId 'id' with concrete type", () => {
      expect(
        isIdParameter(
          createMockParameter({ sectionId: "id", type: "number/=" }),
        ),
      ).toBe(true);
    });

    it("should return true for sectionId 'id' with string type", () => {
      expect(
        isIdParameter(
          createMockParameter({ sectionId: "id", type: "string/=" }),
        ),
      ).toBe(true);
    });

    it("should return true for legacy type 'id' (backward compat)", () => {
      expect(isIdParameter(createMockParameter({ type: "id" }))).toBe(true);
    });

    it("should return false for non-id parameters", () => {
      expect(isIdParameter(createMockParameter({ type: "number/=" }))).toBe(
        false,
      );
      expect(
        isIdParameter(
          createMockParameter({ sectionId: "number", type: "number/=" }),
        ),
      ).toBe(false);
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
