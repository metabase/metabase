import { dimensionFilterForParameter } from "./field-filters";

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
    };
    const typelessDimension = {
      field: () => field,
    };

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
          type: "city",
          field: () => ({ ...field, isCity: () => true }),
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
        const predicate = dimensionFilterForParameter(parameter);
        expect(predicate(typelessDimension)).toBe(false);
        expect(predicate(dimension)).toBe(true);
      });
    });

    it("should return a predicate that evaluates to false for a coordinate dimension when given a number parameter", () => {
      const coordinateDimension = {
        field: () => ({
          ...field,
          isNumber: () => true,
          isCoordinate: () => true,
        }),
      };

      const predicate = dimensionFilterForParameter({ type: "number/between" });
      expect(predicate(coordinateDimension)).toBe(false);
    });

    it("should return a predicate that evaluates to false for a location dimension when given a category parameter", () => {
      const locationDimension = {
        field: () => ({
          ...field,
          isLocation: () => true,
        }),
      };

      const predicate = dimensionFilterForParameter({ type: "category" });
      expect(predicate(locationDimension)).toBe(false);
    });
  });
});
