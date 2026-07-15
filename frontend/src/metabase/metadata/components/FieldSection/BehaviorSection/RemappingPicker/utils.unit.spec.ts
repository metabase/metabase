import type { FieldValue } from "metabase-types/api";
import { createMockField } from "metabase-types/api/mocks";

import { getFieldRemappedValues, getOptions } from "./utils";

describe("RemappingPicker/utils", () => {
  describe("getFieldRemappedValues", () => {
    it("maps labeled values to their labels", () => {
      const values: FieldValue[] = [
        [1, "Active"],
        [2, "Pending"],
      ];
      expect(getFieldRemappedValues(values)).toEqual(
        new Map([
          [1, "Active"],
          [2, "Pending"],
        ]),
      );
    });

    it("maps unlabeled values to undefined", () => {
      const values: FieldValue[] = [[1], [2], [3]];
      expect(getFieldRemappedValues(values)).toEqual(
        new Map([
          [1, undefined],
          [2, undefined],
          [3, undefined],
        ]),
      );
    });

    it("handles a mix of labeled and unlabeled values", () => {
      const values: FieldValue[] = [[1, "Active"], [2], [3, "Closed"]];
      expect(getFieldRemappedValues(values)).toEqual(
        new Map([
          [1, "Active"],
          [2, undefined],
          [3, "Closed"],
        ]),
      );
    });

    it("keeps null keys", () => {
      expect(getFieldRemappedValues([[null]])).toEqual(
        new Map([[null, undefined]]),
      );
    });

    it("drops non-numeric keys", () => {
      const values: FieldValue[] = [["small"], ["large"]];
      expect(getFieldRemappedValues(values)).toEqual(new Map());
    });

    it("returns an empty map for empty or missing values", () => {
      expect(getFieldRemappedValues([])).toEqual(new Map());
      expect(getFieldRemappedValues(undefined)).toEqual(new Map());
    });
  });

  describe("getOptions custom-mapping eligibility", () => {
    const field = createMockField({ semantic_type: null }); // not a foreign key
    const optionsFor = (fieldValues: FieldValue[] | undefined) =>
      getOptions(field, fieldValues, undefined);

    it("offers custom mapping when every value is numeric", () => {
      expect(optionsFor([[1], [2], [3]])).toContain("custom");
    });

    it("offers custom mapping when numeric values include null", () => {
      expect(optionsFor([[1], [null]])).toContain("custom");
    });

    it("does not offer custom mapping for string values", () => {
      expect(optionsFor([["a"], ["b"]])).not.toContain("custom");
    });

    it("does not offer custom mapping when values are mixed", () => {
      expect(optionsFor([[1], ["a"]])).not.toContain("custom");
    });

    it("does not offer custom mapping when there are no values", () => {
      expect(optionsFor([])).not.toContain("custom");
      expect(optionsFor(undefined)).not.toContain("custom");
    });
  });
});
