import {
  getParameterTargetField,
  isDimensionTarget,
  isVariableTarget,
} from "./targets";
import {
  metadata,
  PRODUCTS,
  SAMPLE_DATASET,
} from "__support__/sample_dataset_fixture";

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

  describe("getParameterTargetField", () => {
    it("should return null when the target is not a dimension", () => {
      expect(getParameterTargetField(["variable", "foo"], metadata)).toBe(null);
    });

    it("should return the mapped field behind a template tag field filter", () => {
      const target = ["dimension", ["template-tag", "foo"]];
      const question = SAMPLE_DATASET.nativeQuestion({
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
      const question = SAMPLE_DATASET.question({
        "source-table": PRODUCTS.id,
      });
      expect(getParameterTargetField(target, metadata, question)).toBe(
        PRODUCTS.CATEGORY,
      );
    });
  });
});
