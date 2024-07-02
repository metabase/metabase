import {
  getParameterType,
  getParameterSubType,
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

    it("should prefer using a sectionId for determing the type if it exists", () => {
      expect(
        getParameterType({ sectionId: "location", type: "string/=" }),
      ).toEqual("location");
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
