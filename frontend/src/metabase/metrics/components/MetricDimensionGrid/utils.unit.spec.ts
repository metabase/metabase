import {
  createMetricMetadata,
  createMockMetricDimension,
  createMockNormalizedMetric,
  setupDefinition,
} from "metabase/metrics-viewer/utils/__tests__/test-helpers";

import { getDefaultDimensions } from "./utils";

type MetricDimensionOptions = NonNullable<
  Parameters<typeof createMockMetricDimension>[0]
>;

type MetricDimensionOptionsWithFieldValues = MetricDimensionOptions & {
  has_field_values?: "list" | "search" | "none";
};

function createDimension(options: MetricDimensionOptionsWithFieldValues) {
  return createMockMetricDimension(options as MetricDimensionOptions);
}

describe("getDefaultDimensions", () => {
  const CATEGORY_SELECTION_METRIC = createMockNormalizedMetric({
    id: 101,
    name: "Category Selection",
    dimensions: [
      createDimension({
        id: "dim-category",
        display_name: "Category",
        effective_type: "type/Text",
        semantic_type: "type/Category",
        has_field_values: "list",
      }),
      createDimension({
        id: "dim-status",
        display_name: "Status",
        effective_type: "type/Text",
        semantic_type: null,
        has_field_values: "list",
      }),
    ],
  });

  const metadata = createMetricMetadata([CATEGORY_SELECTION_METRIC]);
  const definition = setupDefinition(metadata, CATEGORY_SELECTION_METRIC.id);

  it("only returns preferred category dimensions for overview cards", () => {
    expect(getDefaultDimensions(definition)).toEqual([
      {
        dimensionId: "dim-category",
        dimensionType: "category",
        label: "Category",
        // Status should not be included because it's not preferred
      },
    ]);
  });
});
