import type Dimension from "metabase-lib/v1/Dimension";
import type Field from "metabase-lib/v1/metadata/Field";
import {
  createMockParameter,
  createMockTemplateTag,
} from "metabase-types/api/mocks";

import {
  dimensionFilterForParameter,
  getTagOperatorFilterForParameter,
} from "./filters";

describe("parameters/utils/field-filters", () => {
  describe("dimensionFilterForParameter", () => {
    const field = {
      isDate: () => false,
      isID: () => false,
      isCategory: () => false,
      isCity: () => false,
      isState: () => false,
      isZipCode: () => false,
      isCountry: () => false,
      isNumber: () => false,
      isString: () => false,
      isLocation: () => false,
    } as Field;
    const typelessDimension = {
      field: () => field,
    } as Dimension;

    [
      [
        { type: "date/single" },
        {
          type: "date",
          field: () => ({ ...field, isDate: () => true }),
        },
      ],
      [
        { type: "id" },
        {
          type: "id",
          field: () => ({ ...field, isID: () => true }),
        },
      ],
      [
        { type: "category" },
        {
          type: "category",
          field: () => ({ ...field, isCategory: () => true }),
        },
      ],
      [
        { type: "location/city" },
        {
          type: "location",
          field: () => ({
            ...field,
            isLocation: () => true,
            isCity: () => true,
          }),
        },
      ],
      [
        { type: "number/!=" },
        {
          type: "number",
          field: () => ({
            ...field,
            isNumber: () => true,
            isCoordinate: () => false,
          }),
        },
      ],
      [
        { type: "string/=" },
        {
          type: "category",
          field: () => ({
            ...field,
            isString: () => true,
            isCategory: () => true,
          }),
        },
      ],
      [
        { type: "string/!=" },
        {
          type: "category",
          field: () => ({
            ...field,
            isString: () => true,
            isCategory: () => true,
          }),
        },
      ],
      [
        { type: "string/starts-with" },
        {
          type: "string",
          field: () => ({
            ...field,
            isString: () => true,
          }),
        },
      ],
    ].forEach(([parameter, dimension]) => {
      it(`should return a predicate that evaluates to true for a ${dimension.type} dimension when given a ${parameter.type} parameter`, () => {
        const predicate = dimensionFilterForParameter(
          createMockParameter(parameter),
        );
        expect(predicate(typelessDimension)).toBe(false);
        expect(predicate(dimension as unknown as Dimension)).toBe(true);
      });
    });

    it("should return a predicate that evaluates to false for a coordinate dimension when given a number parameter", () => {
      const coordinateDimension = {
        field: () => ({
          ...field,
          isNumber: () => true,
          isCoordinate: () => true,
        }),
      } as Dimension;

      const predicate = dimensionFilterForParameter(
        createMockParameter({ type: "number/between" }),
      );
      expect(predicate(coordinateDimension)).toBe(false);
    });

    it("should return a predicate that evaluates to false for a location dimension when given a category parameter", () => {
      const locationDimension = {
        field: () => ({
          ...field,
          isLocation: () => true,
        }),
      } as Dimension;

      const predicate = dimensionFilterForParameter(
        createMockParameter({ type: "category" }),
      );
      expect(predicate(locationDimension)).toBe(false);
    });
  });

  describe("getTagOperatorFilterForParameter", () => {
    it("should return a predicate that evaluates to true for a template tag that has the same subtype operator as the given parameter", () => {
      const predicate = getTagOperatorFilterForParameter(
        createMockParameter({
          type: "string/starts-with",
        }),
      );
      const templateTag1 = createMockTemplateTag({
        "widget-type": "string/starts-with",
      });
      const templateTag2 = createMockTemplateTag({
        "widget-type": "foo/starts-with",
      });
      const templateTag3 = createMockTemplateTag({
        "widget-type": "string/ends-with",
      });
      expect(predicate(templateTag1)).toBe(true);
      expect(predicate(templateTag2)).toBe(true);
      expect(predicate(templateTag3)).toBe(false);
    });
  });
});
