import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { FieldId, TemplateTag } from "metabase-types/api";
import {
  createMockParameter,
  createMockTemplateTag,
} from "metabase-types/api/mocks";
import { ORDERS, PEOPLE, PRODUCTS } from "metabase-types/api/mocks/presets";

import {
  dimensionTagFilterForParameter,
  variableTagFilterForParameter,
} from "./filters";

const query = Lib.createTestNativeQuery(SAMPLE_PROVIDER, {
  query: "SELECT 1",
});

function createDimensionTag(fieldId: FieldId): TemplateTag {
  return createMockTemplateTag({
    name: "tag",
    type: "dimension",
    "field-id": fieldId,
  });
}

describe("parameters/utils/filters", () => {
  describe("dimensionTagFilterForParameter", () => {
    const CASES: [string, string, FieldId][] = [
      ["date/single", "date", ORDERS.CREATED_AT],
      ["id", "id", PRODUCTS.ID],
      ["category", "category", PRODUCTS.CATEGORY],
      ["location/city", "location", PEOPLE.CITY],
      ["number/!=", "number", ORDERS.QUANTITY],
      ["number/between", "coordinate", PEOPLE.LATITUDE],
      ["string/=", "category", PRODUCTS.CATEGORY],
      ["string/starts-with", "string", PRODUCTS.TITLE],
    ];

    it.each(CASES)(
      "should accept %s parameter for %s field",
      (parameterType, _fieldName, fieldId) => {
        const predicate = dimensionTagFilterForParameter(
          query,
          createMockParameter({ type: parameterType }),
        );
        expect(predicate(createDimensionTag(fieldId))).toBe(true);
      },
    );

    it("should reject tag without dimension", () => {
      const predicate = dimensionTagFilterForParameter(
        query,
        createMockParameter({ type: "string/=" }),
      );
      expect(
        predicate(createMockTemplateTag({ name: "tag", type: "dimension" })),
      ).toBe(false);
    });

    it("should reject address field for category parameter", () => {
      const predicate = dimensionTagFilterForParameter(
        query,
        createMockParameter({ type: "category" }),
      );
      expect(predicate(createDimensionTag(PEOPLE.ADDRESS))).toBe(false);
    });

    it("should reject number field for date parameter", () => {
      const predicate = dimensionTagFilterForParameter(
        query,
        createMockParameter({ type: "date/single" }),
      );
      expect(predicate(createDimensionTag(ORDERS.QUANTITY))).toBe(false);
    });
  });

  describe("variableTagFilterForParameter", () => {
    it("should match number tag with number parameter", () => {
      const predicate = variableTagFilterForParameter(
        createMockParameter({ type: "number/=" }),
      );
      expect(predicate(createMockTemplateTag({ type: "number" }))).toBe(true);
      expect(predicate(createMockTemplateTag({ type: "text" }))).toBe(false);
    });
  });
});
