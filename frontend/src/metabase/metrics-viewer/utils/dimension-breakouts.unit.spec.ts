import type { MetricSourceId } from "../types/viewer-state";

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
  resolveCommonDimensionBreakoutLabel,
} from "./dimension-breakouts";

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

  it("does not match exact-column dimensions without the same table group", () => {
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
    ).toBeNull();
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
