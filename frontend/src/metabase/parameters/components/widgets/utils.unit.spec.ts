import { normalizeValue } from "./utils";

describe("metabase/parameters/components/widgets/utils", () => {
  describe("normalizeValue", () => {
    it("returns empty array if value is nil or an empty string", () => {
      expect(normalizeValue(null)).toEqual([]);
      expect(normalizeValue("")).toEqual([]);
      expect(normalizeValue(undefined)).toEqual([]);
      expect(normalizeValue(NaN)).toEqual([]);
    });

    it("returns value if value is an array", () => {
      expect(normalizeValue([1])).toEqual([1]);
      expect(normalizeValue(["foo", 123])).toEqual(["foo", 123]);

      expect(normalizeValue([null])).toEqual([null]);
    });

    it("returns value as item of array if passed value is not an array", () => {
      expect(normalizeValue(1)).toEqual([1]);
      expect(normalizeValue(true)).toEqual([true]);
      expect(normalizeValue("foo")).toEqual(["foo"]);
    });

    it("should correctly normalize a 0 value", () => {
      expect(normalizeValue(0)).toEqual([0]);
    });

    it("should correctly normalize false as a real value", () => {
      expect(normalizeValue(false)).toEqual([false]);
    });
  });
});
