import { checkNotNull } from "metabase/utils/types";
import type { FieldValue } from "metabase-types/api";
import {
  createMockField,
  createMockFieldDimension,
  createMockTable,
} from "metabase-types/api/mocks";

import {
  getFkTargetTableEntityNameOrNull,
  getOptions,
  getValue,
  hydrateTableFields,
} from "./utils";

describe("RemappingPicker/utils", () => {
  describe("getOptions", () => {
    const field = createMockField({ semantic_type: null });
    const optionsFor = (fieldValues: FieldValue[] | undefined) =>
      getOptions(field, fieldValues, undefined);

    it("always offers the original value", () => {
      expect(optionsFor(undefined)).toEqual(["original"]);
    });

    it("offers custom mapping when every value is numeric or null", () => {
      expect(optionsFor([[1], [2], [3]])).toContain("custom");
      expect(optionsFor([[1], [null]])).toContain("custom");
    });

    it("does not offer custom mapping for non-numeric or missing values", () => {
      expect(optionsFor([["a"], ["b"]])).not.toContain("custom");
      expect(optionsFor([[1], ["a"]])).not.toContain("custom");
      expect(optionsFor([])).not.toContain("custom");
    });

    it("offers foreign key mapping only for FK fields with a target table", () => {
      const fkField = createMockField({ semantic_type: "type/FK" });
      const targetTable = createMockTable({ fields: [createMockField()] });

      expect(getOptions(fkField, undefined, targetTable)).toContain("foreign");
      expect(getOptions(fkField, undefined, undefined)).not.toContain(
        "foreign",
      );
      expect(getOptions(field, undefined, targetTable)).not.toContain(
        "foreign",
      );
    });
  });

  describe("getValue", () => {
    it("returns 'original' for a field without dimensions", () => {
      expect(getValue(createMockField())).toBe("original");
      expect(getValue(createMockField({ dimensions: [] }))).toBe("original");
    });

    it("returns 'foreign' for an external dimension", () => {
      const field = createMockField({
        dimensions: [createMockFieldDimension({ type: "external" })],
      });

      expect(getValue(field)).toBe("foreign");
    });

    it("returns 'custom' for an internal dimension", () => {
      const field = createMockField({
        dimensions: [createMockFieldDimension({ type: "internal" })],
      });

      expect(getValue(field)).toBe("custom");
    });
  });

  describe("getFkTargetTableEntityNameOrNull", () => {
    it("returns the id of the target table's entity name field", () => {
      const table = createMockTable({
        fields: [
          createMockField({ id: 3 }),
          createMockField({ id: 7, semantic_type: "type/Name" }),
        ],
      });

      expect(getFkTargetTableEntityNameOrNull(table)).toBe(7);
    });

    it("returns undefined when there is no entity name field", () => {
      const table = createMockTable({ fields: [createMockField({ id: 3 })] });

      expect(getFkTargetTableEntityNameOrNull(table)).toBe(undefined);
      expect(getFkTargetTableEntityNameOrNull(undefined)).toBe(undefined);
    });
  });

  describe("hydrateTableFields", () => {
    it("adds DataSelector compatibility methods to every field", () => {
      const table = createMockTable({
        fields: [createMockField({ display_name: "Total" })],
      });

      const hydratedField = checkNotNull(
        hydrateTableFields(table)?.fields?.[0],
      );

      expect(hydratedField).toEqual(
        expect.objectContaining({
          display_name: "Total",
          displayName: expect.any(Function),
          icon: expect.any(Function),
          getPlainObject: expect.any(Function),
          table,
        }),
      );
    });

    it("passes through an undefined table", () => {
      expect(hydrateTableFields(undefined)).toBe(undefined);
    });
  });
});
