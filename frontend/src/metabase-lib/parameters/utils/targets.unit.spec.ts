import {
  metadata,
  PRODUCTS,
  SAMPLE_DATABASE,
} from "__support__/sample_database_fixture";
import { isDimensionTarget } from "metabase-types/guards";
import type { Card, ParameterDimensionTarget } from "metabase-types/api";
import { createMockTemplateTag } from "metabase-types/api/mocks";
import Database from "metabase-lib/metadata/Database";
import {
  getParameterTargetField,
  isVariableTarget,
  getTemplateTagFromTarget,
  getTargetFieldFromCard,
} from "metabase-lib/parameters/utils/targets";

describe("parameters/utils/targets", () => {
  describe("isDimensionTarget", () => {
    it("should return false for non-dimension targets", () => {
      expect(isDimensionTarget(["variable", ["template-tag", "foo"]])).toBe(
        false,
      );
      // @ts-expect-error - this function is still used in untyped code -- making sure non-arrays don't blow up
      expect(isDimensionTarget()).toBe(false);
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
      expect(isVariableTarget(["dimension", ["field", 1, null]])).toBe(false);
      expect(isVariableTarget(["dimension", ["template-tag", "foo"]])).toBe(
        false,
      );
      // @ts-expect-error - this function is still used in untyped code -- making sure non-arrays don't blow up
      expect(isVariableTarget()).toBe(false);
    });

    it("should return true for a variable target", () => {
      expect(isVariableTarget(["variable", ["template-tag", "foo"]])).toBe(
        true,
      );
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
      // @ts-expect-error - this function is still used in untyped code -- making sure non-arrays don't blow up
      expect(getTemplateTagFromTarget(["dimension"])).toBe(null);
      // @ts-expect-error - this function is still used in untyped code -- making sure non-arrays don't blow up
      expect(getTemplateTagFromTarget()).toBe(null);
      expect(
        getTemplateTagFromTarget(["dimension", ["field", 123, null]]),
      ).toBe(null);
    });
  });

  describe("getParameterTargetField", () => {
    it("should return null when the target is not a dimension", () => {
      const question = SAMPLE_DATABASE.nativeQuestion({
        query: "select * from PRODUCTS where CATEGORY = {{foo}}",
        "template-tags": {
          foo: createMockTemplateTag({
            type: "text",
          }),
        },
      });

      expect(
        getParameterTargetField(
          ["variable", ["template-tag", "foo"]],
          metadata,
          question,
        ),
      ).toBe(null);
    });

    it("should return the mapped field behind a template tag field filter", () => {
      const target: ParameterDimensionTarget = [
        "dimension",
        ["template-tag", "foo"],
      ];
      const question = SAMPLE_DATABASE.nativeQuestion({
        query: "select * from PRODUCTS where {{foo}}",
        "template-tags": {
          foo: createMockTemplateTag({
            type: "dimension",
            dimension: ["field", PRODUCTS.CATEGORY.id, null],
          }),
        },
      });

      expect(getParameterTargetField(target, metadata, question)).toEqual(
        expect.objectContaining({
          id: PRODUCTS.CATEGORY.id,
        }),
      );
    });

    it("should return the target field", () => {
      const target: ParameterDimensionTarget = [
        "dimension",
        ["field", PRODUCTS.CATEGORY.id, null],
      ];
      const question = SAMPLE_DATABASE.question({
        "source-table": PRODUCTS.id,
      });
      expect(getParameterTargetField(target, metadata, question)).toEqual(
        expect.objectContaining({
          id: PRODUCTS.CATEGORY.id,
        }),
      );
    });
  });

  describe("getTargetFieldFromCard", () => {
    const target = [
      "dimension",
      ["field", PRODUCTS.CATEGORY.id, null],
    ] as ParameterDimensionTarget;

    it("should return null when given a card without a `dataset_query`", () => {
      const card = {
        id: 1,
      } as Card;

      expect(getTargetFieldFromCard(target, card, metadata)).toBe(null);
    });

    it("should return the field that maps to the mapping target", () => {
      const field = PRODUCTS.CATEGORY;

      const card = {
        id: 1,
        dataset_query: {
          type: "query",
          database: (SAMPLE_DATABASE as Database).id,
          query: {
            "source-table": PRODUCTS.id,
          },
        },
      } as Card;

      expect(getTargetFieldFromCard(target, card, metadata)).toEqual(
        expect.objectContaining({ id: field.id }),
      );
    });
  });
});
