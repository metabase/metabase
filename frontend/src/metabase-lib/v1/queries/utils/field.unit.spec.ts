import type { FieldValue } from "metabase-types/api";

import { getFieldValues, getRemappings } from "./field";

describe("queries/utils/field", () => {
  describe("getFieldValues", () => {
    it("returns [value, label] tuples as-is", () => {
      const values: FieldValue[] = [
        [1, "One"],
        [2, "Two"],
      ];

      expect(getFieldValues({ values })).toEqual(values);
    });

    it("keeps tuples without labels", () => {
      const values: FieldValue[] = [[1, "One"], [2]];

      expect(getFieldValues({ values })).toEqual(values);
    });

    it("wraps deprecated flat values into 1-tuples", () => {
      expect(getFieldValues({ values: [1, 2, 3] })).toEqual([[1], [2], [3]]);
    });

    it("zips deprecated { values, human_readable_values } objects into tuples", () => {
      expect(
        getFieldValues({
          values: { values: [1, 2], human_readable_values: ["One", "Two"] },
        }),
      ).toEqual([
        [1, "One"],
        [2, "Two"],
      ]);
    });

    it("wraps deprecated { values } objects without labels into 1-tuples", () => {
      expect(getFieldValues({ values: { values: [1, 2] } })).toEqual([
        [1],
        [2],
      ]);
    });

    it("returns an empty list when values are missing or empty", () => {
      expect(getFieldValues()).toEqual([]);
      expect(getFieldValues(null)).toEqual([]);
      expect(getFieldValues({})).toEqual([]);
      expect(getFieldValues({ values: [] })).toEqual([]);
      expect(getFieldValues({ values: {} })).toEqual([]);
    });
  });

  describe("getRemappings", () => {
    it("pads unlabeled values to [value, undefined] pairs", () => {
      expect(getRemappings({ values: [[1], [2, "Two"]] })).toStrictEqual([
        [1, undefined],
        [2, "Two"],
      ]);
    });

    it("appends remappings after field values", () => {
      expect(
        getRemappings({
          values: [[1, "One"]],
          remappings: [[2, "Two"]],
        }),
      ).toEqual([
        [1, "One"],
        [2, "Two"],
      ]);
    });

    it("returns only remappings when field values are missing", () => {
      expect(getRemappings({ remappings: [[1, "One"]] })).toEqual([[1, "One"]]);
    });

    it("returns an empty list for a missing field", () => {
      expect(getRemappings()).toEqual([]);
    });
  });
});
