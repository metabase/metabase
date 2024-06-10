import { createMockMetadata } from "__support__/metadata";
import type Database from "metabase-lib/v1/metadata/Database";
import {
  getParameterTargetField,
  isParameterVariableTarget,
  getTemplateTagFromTarget,
} from "metabase-lib/v1/parameters/utils/targets";
import type { ParameterDimensionTarget } from "metabase-types/api";
import {
  createMockParameter,
  createMockTemplateTag,
} from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import { isDimensionTarget } from "metabase-types/guards";

describe("parameters/utils/targets", () => {
  const metadata = createMockMetadata({
    databases: [createSampleDatabase()],
  });

  const db = metadata.database(SAMPLE_DB_ID) as Database;

  describe("isDimensionTarget", () => {
    it("should return false for non-dimension targets", () => {
      expect(isDimensionTarget(["variable", ["template-tag", "foo"]])).toBe(
        false,
      );
    });

    it('should return true for a target that contains a "dimension" string in the first entry', () => {
      expect(isDimensionTarget(["dimension", ["field", 1, null]])).toBe(true);
      expect(isDimensionTarget(["dimension", ["template-tag", "foo"]])).toBe(
        true,
      );
    });
  });

  describe("isVariableTarget", () => {
    it("should return false for non-variable targets", () => {
      expect(isParameterVariableTarget(["dimension", ["field", 1, null]])).toBe(
        false,
      );
      expect(
        isParameterVariableTarget(["dimension", ["template-tag", "foo"]]),
      ).toBe(false);
    });

    it("should return true for a variable target", () => {
      expect(
        isParameterVariableTarget(["variable", ["template-tag", "foo"]]),
      ).toBe(true);
    });
  });

  describe("getTemplateTagFromTarget", () => {
    it("should return the tag of a template tag target", () => {
      expect(
        getTemplateTagFromTarget(["variable", ["template-tag", "foo"]]),
      ).toBe("foo");
      expect(
        getTemplateTagFromTarget(["dimension", ["template-tag", "bar"]]),
      ).toBe("bar");
    });

    it("should return null for targets that are not template tags", () => {
      expect(
        getTemplateTagFromTarget(["dimension", ["field", 123, null]]),
      ).toBe(null);
    });
  });

  describe("getParameterTargetField", () => {
    it("should return null when the target is not a dimension", () => {
      const question = db.nativeQuestion({
        query: "select * from PRODUCTS where CATEGORY = {{foo}}",
        "template-tags": {
          foo: createMockTemplateTag({
            type: "text",
          }),
        },
      });
      const parameter = createMockParameter();

      expect(
        getParameterTargetField(question, parameter, [
          "variable",
          ["template-tag", "foo"],
        ]),
      ).toBe(null);
    });

    it("should return the mapped field behind a template tag field filter", () => {
      const target: ParameterDimensionTarget = [
        "dimension",
        ["template-tag", "foo"],
      ];
      const question = db.nativeQuestion({
        query: "select * from PRODUCTS where {{foo}}",
        "template-tags": {
          foo: createMockTemplateTag({
            type: "dimension",
            dimension: ["field", PRODUCTS.CATEGORY, null],
          }),
        },
      });
      const parameter = createMockParameter();

      expect(getParameterTargetField(question, parameter, target)).toEqual(
        expect.objectContaining({
          id: PRODUCTS.CATEGORY,
        }),
      );
    });

    it("should return the target field", () => {
      const question = db.question({
        "source-table": PRODUCTS_ID,
      });
      const parameter = createMockParameter();
      const target: ParameterDimensionTarget = [
        "dimension",
        ["field", PRODUCTS.CATEGORY, null],
      ];
      expect(getParameterTargetField(question, parameter, target)).toEqual(
        expect.objectContaining({
          id: PRODUCTS.CATEGORY,
        }),
      );
    });
  });
});
