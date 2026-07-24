import {
  createMetricMetadata,
  setupDefinition,
} from "metabase-lib/v1/metric/test-helpers";
import {
  createMockMetricDimension,
  createMockNormalizedMetric,
} from "metabase-types/api/mocks/metric";

import { getOverviewDimensions } from "./utils";

type MetricDimensionOptions = NonNullable<
  Parameters<typeof createMockMetricDimension>[0]
>;

type MetricDimensionOptionsWithFieldValues = MetricDimensionOptions & {
  has_field_values?: "list" | "search" | "none";
};

function createDimension(options: MetricDimensionOptionsWithFieldValues) {
  return createMockMetricDimension(options);
}

describe("getOverviewDimensions", () => {
  const CURATED_DIMENSIONS_METRIC = createMockNormalizedMetric({
    id: 101,
    name: "Curated Dimensions",
    dimensions: [
      createDimension({
        id: "dim-quantity",
        display_name: "Quantity",
        effective_type: "type/Integer",
        semantic_type: "type/Quantity",
      }),
      createDimension({
        id: "dim-status",
        display_name: "Status",
        effective_type: "type/Text",
        semantic_type: null,
        has_field_values: "list",
      }),
      createDimension({
        id: "dim-created-at",
        display_name: "Created At",
        effective_type: "type/DateTime",
        semantic_type: "type/CreationTimestamp",
      }),
      createDimension({
        id: "dim-orphaned",
        display_name: "Orphaned",
        effective_type: "type/Text",
        semantic_type: "type/Category",
        status: "status/orphaned",
      }),
    ],
  });

  const metadata = createMetricMetadata([CURATED_DIMENSIONS_METRIC]);
  const definition = setupDefinition(metadata, CURATED_DIMENSIONS_METRIC.id);

  it("returns chartable active dimensions in curated order", () => {
    expect(
      getOverviewDimensions(definition, CURATED_DIMENSIONS_METRIC.dimensions),
    ).toEqual([
      {
        dimensionId: "dim-quantity",
        dimensionType: "numeric",
        label: "Quantity",
      },
      {
        dimensionId: "dim-status",
        dimensionType: "category",
        label: "Status",
      },
      {
        dimensionId: "dim-created-at",
        dimensionType: "time",
        label: "Created At",
      },
    ]);
  });
});
