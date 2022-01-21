import {
  getParameterTargetField,
  isDimensionTarget,
  isVariableTarget,
  getTemplateTagFromTarget,
} from "./targets";
import {
  metadata,
  PRODUCTS,
  SAMPLE_DATABASE,
} from "__support__/sample_database_fixture";

describe("parameters/utils/targets", () => {
  describe("isDimensionTarget", () => {
    it('should return true for a target that contanis a "dimension" string in the first entry', () => {
      expect(isDimensionTarget(["foo"])).toBe(false);
      expect(isDimensionTarget()).toBe(false);
      expect(isDimensionTarget(["dimension"])).toBe(true);
    });
  });

  describe("isVariableTarget", () => {
    it('should return true for a target that contanis a "dimension" string in the first entry', () => {
      expect(isVariableTarget(["foo"])).toBe(false);
      expect(isVariableTarget()).toBe(false);
      expect(isVariableTarget(["variable"])).toBe(true);
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
      expect(getTemplateTagFromTarget(["foo"])).toBe(null);
      expect(getTemplateTagFromTarget()).toBe(null);
      expect(
        getTemplateTagFromTarget(["dimension", ["field", 123, null]]),
      ).toBe(null);
    });
  });

  describe("getParameterTargetField", () => {
    it("should return null when the target is not a dimension", () => {
      expect(getParameterTargetField(["variable", "foo"], metadata)).toBe(null);
    });

    it("should return the mapped field behind a template tag field filter", () => {
      const target = ["dimension", ["template-tag", "foo"]];
      const question = SAMPLE_DATABASE.nativeQuestion({
        query: "select * from PRODUCTS where {{foo}}",
        "template-tags": {
          foo: {
            type: "dimension",
            dimension: ["field", PRODUCTS.CATEGORY.id, null],
          },
        },
      });

      expect(getParameterTargetField(target, metadata, question)).toBe(
        PRODUCTS.CATEGORY,
      );
    });

    it("should return the target field", () => {
      const target = ["dimension", ["field", PRODUCTS.CATEGORY.id, null]];
      const question = SAMPLE_DATABASE.question({
        "source-table": PRODUCTS.id,
      });
      expect(getParameterTargetField(target, metadata, question)).toBe(
        PRODUCTS.CATEGORY,
      );
    });
  });
});
