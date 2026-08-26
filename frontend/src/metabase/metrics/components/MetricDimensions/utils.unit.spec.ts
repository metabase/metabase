import {
  createMockMetricDimension,
  createMockMetricDimensionGroup,
} from "metabase-types/api/mocks/metric";

import { getDimensionTypeKey, getNewDimensionTitle } from "./utils";

describe("getDimensionTypeKey", () => {
  it("classifies temporal columns as date", () => {
    expect(
      getDimensionTypeKey(
        createMockMetricDimension({ effective_type: "type/DateTime" }),
      ),
    ).toBe("date");
  });

  it("classifies location and coordinate columns as geolocation", () => {
    expect(
      getDimensionTypeKey(
        createMockMetricDimension({
          effective_type: "type/Text",
          semantic_type: "type/Country",
        }),
      ),
    ).toBe("geolocation");
    expect(
      getDimensionTypeKey(
        createMockMetricDimension({
          effective_type: "type/Float",
          semantic_type: "type/Latitude",
        }),
      ),
    ).toBe("geolocation");
  });

  it("classifies category, string, and boolean columns as category", () => {
    expect(
      getDimensionTypeKey(
        createMockMetricDimension({
          effective_type: "type/Text",
          semantic_type: "type/Category",
        }),
      ),
    ).toBe("category");
    expect(
      getDimensionTypeKey(
        createMockMetricDimension({
          effective_type: "type/Text",
          semantic_type: null,
        }),
      ),
    ).toBe("category");
    expect(
      getDimensionTypeKey(
        createMockMetricDimension({
          effective_type: "type/Boolean",
          semantic_type: null,
        }),
      ),
    ).toBe("category");
  });

  it("classifies numeric columns as number", () => {
    expect(
      getDimensionTypeKey(
        createMockMetricDimension({
          effective_type: "type/Integer",
          semantic_type: null,
        }),
      ),
    ).toBe("number");
  });

  it("falls back to other for unclassified columns", () => {
    expect(
      getDimensionTypeKey(
        createMockMetricDimension({
          effective_type: "type/Structured",
          semantic_type: null,
        }),
      ),
    ).toBe("other");
  });
});

describe("getNewDimensionTitle", () => {
  it("prefixes joined-table columns with the source table name", () => {
    expect(
      getNewDimensionTitle(
        createMockMetricDimensionGroup({
          type: "connection",
          display_name: "Product",
        }),
        createMockMetricDimension({ display_name: "Category" }),
      ),
    ).toBe("Product - Category");
  });

  it("keeps the plain name for the metric's own table", () => {
    expect(
      getNewDimensionTitle(
        createMockMetricDimensionGroup({
          type: "main",
          display_name: "Orders",
        }),
        createMockMetricDimension({ display_name: "Created At" }),
      ),
    ).toBe("Created At");
  });
});
