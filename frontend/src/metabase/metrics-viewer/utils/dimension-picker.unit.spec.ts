import type { MetricSourceId } from "../types/viewer-state";

import {
  REVENUE_METRIC,
  createMetricMetadata,
  createMockMetricDimension,
  createMockNormalizedMetric,
  setupDefinition,
} from "./__tests__/test-helpers";
import { getAvailableDimensionsForPicker } from "./dimension-picker";

const ORDERS_METRIC = createMockNormalizedMetric({
  id: 3,
  name: "Orders",
  dimensions: [
    createMockMetricDimension({
      id: "dim-created-at",
      display_name: "Created At",
      effective_type: "type/DateTime",
      semantic_type: "type/CreationTimestamp",
    }),
    createMockMetricDimension({
      id: "dim-status",
      display_name: "Status",
      effective_type: "type/Text",
      semantic_type: "type/Category",
    }),
  ],
});

const allMetadata = createMetricMetadata([REVENUE_METRIC, ORDERS_METRIC]);
const revenueDefinition = setupDefinition(allMetadata, REVENUE_METRIC.id);
const ordersDefinition = setupDefinition(allMetadata, ORDERS_METRIC.id);

const REVENUE_SOURCE_ID: MetricSourceId = `metric:${REVENUE_METRIC.id}`;
const ORDERS_SOURCE_ID: MetricSourceId = `metric:${ORDERS_METRIC.id}`;

const REVENUE_DIMENSIONS = [
  {
    icon: "int",
    group: undefined,
    tabInfo: {
      type: "numeric",
      label: "Amount",
      dimensionMapping: { [REVENUE_SOURCE_ID]: "dim-amount" },
    },
  },
  {
    icon: "string",
    group: undefined,
    tabInfo: {
      type: "category",
      label: "Category",
      dimensionMapping: { [REVENUE_SOURCE_ID]: "dim-category" },
    },
  },
  {
    icon: "calendar",
    group: undefined,
    tabInfo: {
      type: "time",
      label: "Created At",
      dimensionMapping: { [REVENUE_SOURCE_ID]: "dim-created-at" },
    },
  },
  {
    icon: "io",
    group: undefined,
    tabInfo: {
      type: "boolean",
      label: "Is Active",
      dimensionMapping: { [REVENUE_SOURCE_ID]: "dim-active" },
    },
  },
];

const ORDERS_DIMENSIONS = [
  {
    icon: "calendar",
    group: undefined,
    tabInfo: {
      type: "time",
      label: "Created At",
      dimensionMapping: { [ORDERS_SOURCE_ID]: "dim-created-at" },
    },
  },
  {
    icon: "string",
    group: undefined,
    tabInfo: {
      type: "category",
      label: "Status",
      dimensionMapping: { [ORDERS_SOURCE_ID]: "dim-status" },
    },
  },
];

describe("getAvailableDimensionsForPicker", () => {
  it("returns empty result for empty source order", () => {
    const result = getAvailableDimensionsForPicker({}, [], new Set());

    expect(result).toEqual({ shared: [], bySource: {} });
  });

  it("returns dimensions for a single metric source", () => {
    const result = getAvailableDimensionsForPicker(
      { [REVENUE_SOURCE_ID]: revenueDefinition },
      [REVENUE_SOURCE_ID],
      new Set(),
    );

    expect(result).toEqual({
      shared: [],
      bySource: {
        [REVENUE_SOURCE_ID]: REVENUE_DIMENSIONS,
      },
    });
  });

  it("returns dimensions for a second metric source", () => {
    const result = getAvailableDimensionsForPicker(
      { [ORDERS_SOURCE_ID]: ordersDefinition },
      [ORDERS_SOURCE_ID],
      new Set(),
    );

    expect(result).toEqual({
      shared: [],
      bySource: {
        [ORDERS_SOURCE_ID]: ORDERS_DIMENSIONS,
      },
    });
  });

  it("groups dimensions by source when multiple sources are provided", () => {
    const result = getAvailableDimensionsForPicker(
      {
        [REVENUE_SOURCE_ID]: revenueDefinition,
        [ORDERS_SOURCE_ID]: ordersDefinition,
      },
      [REVENUE_SOURCE_ID, ORDERS_SOURCE_ID],
      new Set(),
    );

    expect(result).toEqual({
      shared: [],
      bySource: {
        [REVENUE_SOURCE_ID]: REVENUE_DIMENSIONS,
        [ORDERS_SOURCE_ID]: ORDERS_DIMENSIONS,
      },
    });
  });

  it("filters out dimensions whose id matches existingTabDimensionIds", () => {
    const allIds = REVENUE_DIMENSIONS.flatMap((dimension) =>
      Object.values(dimension.tabInfo.dimensionMapping),
    );

    const result = getAvailableDimensionsForPicker(
      { [REVENUE_SOURCE_ID]: revenueDefinition },
      [REVENUE_SOURCE_ID],
      new Set(allIds),
    );

    expect(result).toEqual({ shared: [], bySource: {} });
  });
});
