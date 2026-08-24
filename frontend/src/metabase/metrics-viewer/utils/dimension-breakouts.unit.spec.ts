import { createMockMetricDimensionGroup } from "metabase-types/api/mocks/metric";

import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerDimensionBreakoutState,
} from "../types/viewer-state";

import {
  createMetricMetadata,
  createMockMetricDimension,
  createMockNormalizedMetric,
  setupDefinition,
} from "./__tests__/test-helpers";
import {
  computeDefaultDimensionBreakouts,
  createDimensionBreakoutFromInfo,
  findMatchingDimensionForBreakout,
  getDimensionBreakoutLabel,
  getDimensionBreakoutTypeLabel,
  resolveCommonDimensionBreakoutLabel,
} from "./dimension-breakouts";

describe("getDimensionBreakoutTypeLabel", () => {
  it.each([
    ["time", "Time"],
    ["category", "Category"],
    ["boolean", "Boolean"],
    ["numeric", "Number"],
  ] as const)("labels %s breakouts by dimension type", (type, label) => {
    expect(getDimensionBreakoutTypeLabel(type)).toBe(label);
  });

  it.each(["geo", "scalar"] as const)(
    "returns null for %s breakouts, which keep their own labels",
    (type) => {
      expect(getDimensionBreakoutTypeLabel(type)).toBeNull();
    },
  );
});

describe("getDimensionBreakoutLabel", () => {
  const firstMetric = createMockNormalizedMetric({
    id: 201,
    dimensions: [
      createMockMetricDimension({
        id: "first-vendor",
        name: "VENDOR",
        display_name: "Preferred vendor",
        semantic_type: "type/Category",
        group: createMockMetricDimensionGroup({ display_name: "Orders" }),
      }),
      createMockMetricDimension({
        id: "first-total",
        name: "AMOUNT",
        display_name: "Total",
        effective_type: "type/Float",
        semantic_type: "type/Currency",
      }),
      createMockMetricDimension({
        id: "first-created-at",
        display_name: "Created At",
        effective_type: "type/DateTime",
        semantic_type: "type/CreationTimestamp",
      }),
      createMockMetricDimension({
        id: "first-state",
        display_name: "Shipping region",
        semantic_type: "type/State",
      }),
    ],
  });
  const secondMetric = createMockNormalizedMetric({
    id: 202,
    dimensions: [
      createMockMetricDimension({
        id: "second-vendor",
        name: "VENDOR",
        display_name: "Vendor",
        semantic_type: "type/Category",
        group: createMockMetricDimensionGroup({ display_name: "Products" }),
      }),
      createMockMetricDimension({
        id: "second-total",
        name: "PAID_AMOUNT",
        display_name: "Total",
        effective_type: "type/Float",
        semantic_type: "type/Currency",
      }),
      createMockMetricDimension({
        id: "second-subtotal",
        display_name: "Subtotal",
        effective_type: "type/Float",
        semantic_type: "type/Currency",
      }),
    ],
  });
  const firstSourceId: MetricSourceId = `metric:${firstMetric.id}`;
  const secondSourceId: MetricSourceId = `metric:${secondMetric.id}`;
  const metadata = createMetricMetadata([firstMetric, secondMetric]);
  const definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry> = {
    [firstSourceId]: {
      id: firstSourceId,
      definition: setupDefinition(metadata, firstMetric.id),
    },
    [secondSourceId]: {
      id: secondSourceId,
      definition: setupDefinition(metadata, secondMetric.id),
    },
  };
  const metricSlots = [
    { slotIndex: 0, entityIndex: 0, sourceId: firstSourceId },
    { slotIndex: 1, entityIndex: 1, sourceId: secondSourceId },
  ];

  function createBreakout(
    type: MetricsViewerDimensionBreakoutState["type"],
    dimensionMapping: Record<number, string | null>,
    label: string,
  ): MetricsViewerDimensionBreakoutState {
    return {
      id: label,
      type,
      label,
      display: "bar",
      dimensionMapping,
      projectionConfig: {},
    };
  }

  it("uses the breakout type when mapped dimensions have different curated display names", () => {
    const breakout = createBreakout(
      "category",
      { 0: "first-vendor", 1: "second-vendor" },
      "Category",
    );

    expect(getDimensionBreakoutLabel(breakout, definitions, metricSlots)).toBe(
      "Category",
    );
  });

  it("uses the curated display name when mapped columns have different names", () => {
    const breakout = createBreakout(
      "numeric",
      { 0: "first-total", 1: "second-total" },
      "Number",
    );

    expect(getDimensionBreakoutLabel(breakout, definitions, metricSlots)).toBe(
      "Total",
    );
  });

  it("uses the breakout type when mapped column names differ", () => {
    const breakout = createBreakout(
      "numeric",
      { 0: "first-total", 1: "second-subtotal" },
      "Total",
    );

    expect(getDimensionBreakoutLabel(breakout, definitions, metricSlots)).toBe(
      "Number",
    );
  });

  it("uses the curated display name when only one slot is mapped", () => {
    const breakout = createBreakout(
      "numeric",
      { 0: "first-total", 1: null },
      "Number",
    );

    expect(getDimensionBreakoutLabel(breakout, definitions, metricSlots)).toBe(
      "Total",
    );
  });

  it("always labels time breakouts by type", () => {
    const breakout = createBreakout(
      "time",
      { 0: "first-created-at" },
      "Created At",
    );

    expect(getDimensionBreakoutLabel(breakout, definitions, metricSlots)).toBe(
      "Time",
    );
  });

  it("always labels state breakouts by subtype", () => {
    const breakout = createBreakout(
      "geo",
      { 0: "first-state" },
      "Shipping region",
    );

    expect(getDimensionBreakoutLabel(breakout, definitions, metricSlots)).toBe(
      "State",
    );
  });

  it("falls back to the stored label when no mapped dimension resolves", () => {
    const breakout = createBreakout(
      "category",
      { 0: "missing-dimension" },
      "Stored label",
    );

    expect(getDimensionBreakoutLabel(breakout, definitions, metricSlots)).toBe(
      "Stored label",
    );
  });
});

describe("resolveCommonDimensionBreakoutLabel", () => {
  it("returns null for empty array", () => {
    expect(resolveCommonDimensionBreakoutLabel([])).toBeNull();
  });

  it("returns the name when only one is provided", () => {
    expect(resolveCommonDimensionBreakoutLabel(["Created At"])).toBe(
      "Created At",
    );
  });

  it("returns the name when all names are identical", () => {
    expect(
      resolveCommonDimensionBreakoutLabel(["Created At", "Created At"]),
    ).toBe("Created At");
  });

  it("returns the most frequent name", () => {
    expect(
      resolveCommonDimensionBreakoutLabel([
        "Created At",
        "Order Date",
        "Created At",
      ]),
    ).toBe("Created At");
  });

  it("returns the first name when tied", () => {
    expect(resolveCommonDimensionBreakoutLabel(["State", "Category"])).toBe(
      "State",
    );
  });

  it("returns the first name when two different names are tied", () => {
    expect(
      resolveCommonDimensionBreakoutLabel(["Created At", "Order Date"]),
    ).toBe("Created At");
  });
});

describe("createDimensionBreakoutFromInfo", () => {
  it("uses the first non-null dimension mapping as the dimensionBreakout id", () => {
    expect(
      createDimensionBreakoutFromInfo({
        type: "numeric",
        label: "Total",
        dimensionMapping: { 0: null, 1: "dim-orders-total" },
      }),
    ).toEqual({
      id: "dim-orders-total",
      type: "numeric",
      label: "Total",
      display: "bar",
      dimensionMapping: { 0: null, 1: "dim-orders-total" },
      projectionConfig: {},
    });
  });

  it("uses the preferred id when one is provided", () => {
    expect(
      createDimensionBreakoutFromInfo({
        id: "dim-selected-created-at",
        type: "time",
        label: "Created At",
        dimensionMapping: {
          0: "dim-comparable-canceled-at",
          1: "dim-selected-created-at",
        },
      }),
    ).toEqual({
      id: "dim-selected-created-at",
      type: "time",
      label: "Created At",
      display: "line",
      dimensionMapping: {
        0: "dim-comparable-canceled-at",
        1: "dim-selected-created-at",
      },
      projectionConfig: {},
    });
  });
});

describe("computeDefaultDimensionBreakouts", () => {
  const CATEGORY_SELECTION_METRIC = createMockNormalizedMetric({
    id: 101,
    name: "Category Selection",
    dimensions: [
      createMockMetricDimension({
        id: "dim-category",
        display_name: "Category",
        effective_type: "type/Text",
        semantic_type: "type/Category",
      }),
      createMockMetricDimension({
        id: "dim-status",
        display_name: "Status",
        effective_type: "type/Text",
        semantic_type: null,
      }),
    ],
  });

  const sourceId: MetricSourceId = `metric:${CATEGORY_SELECTION_METRIC.id}`;
  const metadata = createMetricMetadata([CATEGORY_SELECTION_METRIC]);
  const definition = setupDefinition(metadata, CATEGORY_SELECTION_METRIC.id);

  it("only auto-creates category dimensionBreakouts for preferred category dimensions", () => {
    const dimensionBreakouts = computeDefaultDimensionBreakouts(
      { [sourceId]: definition },
      [{ slotIndex: 0, entityIndex: 0, sourceId }],
    );

    // Status should not be included because it's not preferred
    expect(
      dimensionBreakouts.map((dimensionBreakout) => dimensionBreakout.label),
    ).toEqual(["Category", "Totals"]);
  });

  describe("curated default dimension", () => {
    const setupMetric = (
      metric: ReturnType<typeof createMockNormalizedMetric>,
    ) => {
      const metricSourceId: MetricSourceId = `metric:${metric.id}`;
      const metricDefinition = setupDefinition(
        createMetricMetadata([metric]),
        metric.id,
      );
      return computeDefaultDimensionBreakouts(
        { [metricSourceId]: metricDefinition },
        [{ slotIndex: 0, entityIndex: 0, sourceId: metricSourceId }],
      );
    };

    it("puts the curated default dimension's breakout first", () => {
      const dimensionBreakouts = setupMetric(
        createMockNormalizedMetric({
          id: 102,
          name: "Category Default",
          dimensions: [
            createMockMetricDimension({
              id: "dim-created-at",
              display_name: "Created At",
              effective_type: "type/DateTime",
              semantic_type: "type/CreationTimestamp",
            }),
            createMockMetricDimension({
              id: "dim-default-category",
              display_name: "Category",
              effective_type: "type/Text",
              semantic_type: "type/Category",
              default: true,
            }),
          ],
        }),
      );

      expect(
        dimensionBreakouts.map((dimensionBreakout) => dimensionBreakout.label),
      ).toEqual(["Category", "Created At", "Totals"]);
      expect(dimensionBreakouts[0]).toMatchObject({
        id: "dim-default-category",
        type: "category",
        dimensionMapping: { 0: "dim-default-category" },
      });
    });

    it("creates and promotes a breakout for a non-preferred curated default", () => {
      const dimensionBreakouts = setupMetric(
        createMockNormalizedMetric({
          id: 103,
          name: "Non-preferred Default",
          dimensions: [
            createMockMetricDimension({
              id: "dim-created-at",
              display_name: "Created At",
              effective_type: "type/DateTime",
              semantic_type: "type/CreationTimestamp",
            }),
            createMockMetricDimension({
              id: "dim-default-status",
              display_name: "Status",
              effective_type: "type/Text",
              semantic_type: null,
              default: true,
            }),
          ],
        }),
      );

      expect(
        dimensionBreakouts.map((dimensionBreakout) => dimensionBreakout.label),
      ).toEqual(["Status", "Created At", "Totals"]);
      expect(dimensionBreakouts[0].dimensionMapping).toEqual({
        0: "dim-default-status",
      });
    });

    it("creates and promotes a breakout for a curated default of a type that never auto-creates", () => {
      const dimensionBreakouts = setupMetric(
        createMockNormalizedMetric({
          id: 104,
          name: "Numeric Default",
          dimensions: [
            createMockMetricDimension({
              id: "dim-created-at",
              display_name: "Created At",
              effective_type: "type/DateTime",
              semantic_type: "type/CreationTimestamp",
            }),
            createMockMetricDimension({
              id: "dim-default-amount",
              display_name: "Amount",
              effective_type: "type/Float",
              semantic_type: "type/Currency",
              default: true,
            }),
          ],
        }),
      );

      expect(
        dimensionBreakouts.map((dimensionBreakout) => dimensionBreakout.label),
      ).toEqual(["Amount", "Created At", "Totals"]);
      expect(dimensionBreakouts[0].type).toBe("numeric");
    });

    it("keeps the time breakout first and unduplicated when the curated default is a time dimension", () => {
      const dimensionBreakouts = setupMetric(
        createMockNormalizedMetric({
          id: 105,
          name: "Time Default",
          dimensions: [
            createMockMetricDimension({
              id: "dim-created-at",
              display_name: "Created At",
              effective_type: "type/DateTime",
              semantic_type: "type/CreationTimestamp",
              default: true,
            }),
            createMockMetricDimension({
              id: "dim-default-category",
              display_name: "Category",
              effective_type: "type/Text",
              semantic_type: "type/Category",
            }),
          ],
        }),
      );

      expect(
        dimensionBreakouts.map((dimensionBreakout) => dimensionBreakout.label),
      ).toEqual(["Created At", "Category", "Totals"]);
      expect(dimensionBreakouts[0].id).toBe("time");
    });
  });
});

describe("findMatchingDimensionForBreakout", () => {
  const FIRST_METRIC = createMockNormalizedMetric({
    id: 201,
    name: "First Metric",
    dimensions: [
      createMockMetricDimension({
        id: "dim-first-last-name",
        display_name: "Last Name",
        effective_type: "type/Text",
        semantic_type: "type/Category",
      }),
    ],
  });
  const SECOND_METRIC = createMockNormalizedMetric({
    id: 202,
    name: "Second Metric",
    dimensions: [
      createMockMetricDimension({
        id: "dim-second-last-name",
        display_name: "Last Name",
        effective_type: "type/Text",
        semantic_type: "type/Category",
      }),
    ],
  });
  const SHARED_SOURCE_METRIC = createMockNormalizedMetric({
    id: 203,
    name: "Shared Source Metric",
    dimensions: [
      createMockMetricDimension({
        id: "dim-shared-first-name",
        display_name: "First Name",
        effective_type: "type/Text",
        semantic_type: "type/Category",
        sources: [{ type: "field", "field-id": 1 }],
      }),
    ],
  });
  const MATCHING_SHARED_SOURCE_METRIC = createMockNormalizedMetric({
    id: 204,
    name: "Matching Shared Source Metric",
    dimensions: [
      createMockMetricDimension({
        id: "dim-matching-shared-first-name",
        display_name: "First Name",
        effective_type: "type/Text",
        semantic_type: "type/Category",
        sources: [{ type: "field", "field-id": 1 }],
      }),
    ],
  });

  const firstSourceId: MetricSourceId = `metric:${FIRST_METRIC.id}`;
  const secondSourceId: MetricSourceId = `metric:${SECOND_METRIC.id}`;
  const sharedSourceId: MetricSourceId = `metric:${SHARED_SOURCE_METRIC.id}`;
  const metadata = createMetricMetadata([
    FIRST_METRIC,
    SECOND_METRIC,
    SHARED_SOURCE_METRIC,
    MATCHING_SHARED_SOURCE_METRIC,
  ]);
  const firstDefinition = setupDefinition(metadata, FIRST_METRIC.id);
  const secondDefinition = setupDefinition(metadata, SECOND_METRIC.id);
  const sharedSourceDefinition = setupDefinition(
    metadata,
    SHARED_SOURCE_METRIC.id,
  );
  const matchingSharedSourceDefinition = setupDefinition(
    metadata,
    MATCHING_SHARED_SOURCE_METRIC.id,
  );

  it("matches exact-column dimensions by curated name across sources", () => {
    expect(
      findMatchingDimensionForBreakout(
        secondDefinition,
        {
          id: "dim-first-last-name",
          type: "category",
          label: "Last Name",
          dimensionBySlotIndex: { 0: "dim-first-last-name" },
        },
        { [firstSourceId]: firstDefinition },
        new Map([[0, firstSourceId]]),
      ),
    ).toBe("dim-second-last-name");
  });

  it("falls back to a same-type dimension when neither source nor name match", () => {
    const TIER_METRIC = createMockNormalizedMetric({
      id: 205,
      name: "Tier Metric",
      dimensions: [
        createMockMetricDimension({
          id: "dim-tier",
          display_name: "Tier",
          effective_type: "type/Text",
          semantic_type: "type/Category",
        }),
      ],
    });
    const tierMetadata = createMetricMetadata([FIRST_METRIC, TIER_METRIC]);
    const tierDefinition = setupDefinition(tierMetadata, TIER_METRIC.id);

    expect(
      findMatchingDimensionForBreakout(
        tierDefinition,
        {
          id: "dim-first-last-name",
          type: "category",
          label: "Last Name",
          dimensionBySlotIndex: { 0: "dim-first-last-name" },
        },
        { [firstSourceId]: setupDefinition(tierMetadata, FIRST_METRIC.id) },
        new Map([[0, firstSourceId]]),
      ),
    ).toBe("dim-tier");
  });

  it("matches the exact dimension id when available", () => {
    expect(
      findMatchingDimensionForBreakout(
        firstDefinition,
        {
          id: "dim-first-last-name",
          type: "category",
          label: "Last Name",
          dimensionBySlotIndex: { 1: "dim-first-last-name" },
        },
        { [secondSourceId]: secondDefinition },
        new Map([[1, secondSourceId]]),
      ),
    ).toBe("dim-first-last-name");
  });

  it("matches exact-column dimensions from the same underlying source column", () => {
    expect(
      findMatchingDimensionForBreakout(
        matchingSharedSourceDefinition,
        {
          id: "dim-shared-first-name",
          type: "category",
          label: "First Name",
          dimensionBySlotIndex: { 0: "dim-shared-first-name" },
        },
        { [sharedSourceId]: sharedSourceDefinition },
        new Map([[0, sharedSourceId]]),
      ),
    ).toBe("dim-matching-shared-first-name");
  });
});
