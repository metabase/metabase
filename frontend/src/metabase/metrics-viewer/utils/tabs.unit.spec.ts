import type { MetricSourceId } from "../types/viewer-state";

import {
  createMetricMetadata,
  createMockMetricDimension,
  createMockNormalizedMetric,
  setupDefinition,
} from "./__tests__/test-helpers";
import type {
  AvailableDimension,
  AvailableDimensionsResult,
} from "./dimension-picker";
import { buildDimensionPickerSections } from "./dimension-picker";
import { computeDefaultTabs, resolveCommonTabLabel } from "./tabs";

describe("resolveCommonTabLabel", () => {
  it("returns null for empty array", () => {
    expect(resolveCommonTabLabel([])).toBeNull();
  });

  it("returns the name when only one is provided", () => {
    expect(resolveCommonTabLabel(["Created At"])).toBe("Created At");
  });

  it("returns the name when all names are identical", () => {
    expect(resolveCommonTabLabel(["Created At", "Created At"])).toBe(
      "Created At",
    );
  });

  it("returns the most frequent name", () => {
    expect(
      resolveCommonTabLabel(["Created At", "Order Date", "Created At"]),
    ).toBe("Created At");
  });

  it("returns the first name when tied", () => {
    expect(resolveCommonTabLabel(["State", "Category"])).toBe("State");
  });

  it("returns the first name when two different names are tied", () => {
    expect(resolveCommonTabLabel(["Created At", "Order Date"])).toBe(
      "Created At",
    );
  });
});

describe("computeDefaultTabs", () => {
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

  it("only auto-creates category tabs for preferred category dimensions", () => {
    const tabs = computeDefaultTabs({ [sourceId]: definition }, [
      { slotIndex: 0, entityIndex: 0, sourceId },
    ]);

    // Status should not be included because it's not preferred
    expect(tabs.map((tab) => tab.label)).toEqual(["Category", "Totals"]);
  });
});

function createMockAvailableDimension(label: string): AvailableDimension {
  return {
    icon: "string",
    tabInfo: {
      type: "category",
      label,
      dimensionMapping: {},
    },
  };
}

describe("buildDimensionPickerSections", () => {
  it("builds flat sections for a single source without groups", () => {
    const dimensions: AvailableDimensionsResult = {
      shared: [],
      bySource: {
        "metric:1": [
          createMockAvailableDimension("Category"),
          createMockAvailableDimension("State"),
        ],
      },
    };

    const sections = buildDimensionPickerSections({
      availableDimensions: dimensions,
      sourceOrder: ["metric:1"],
      sourceDataById: {
        "metric:1": { type: "metric", name: "Revenue" },
      },
      hasMultipleSources: false,
    });

    expect(sections).toEqual([
      {
        name: undefined,
        items: [
          expect.objectContaining({ name: "Category" }),
          expect.objectContaining({ name: "State" }),
        ],
      },
    ]);
  });

  it("splits by source and includes shared section for multiple sources", () => {
    const sharedDimension = createMockAvailableDimension("Created At");

    const dimensions: AvailableDimensionsResult = {
      shared: [sharedDimension],
      bySource: {
        "metric:1": [createMockAvailableDimension("Category")],
        "metric:2": [createMockAvailableDimension("Status")],
      },
    };

    const sections = buildDimensionPickerSections({
      availableDimensions: dimensions,
      sourceOrder: ["metric:1", "metric:2"],
      sourceDataById: {
        "metric:1": { type: "metric", name: "Revenue" },
        "metric:2": { type: "metric", name: "Orders" },
      },
      hasMultipleSources: true,
    });

    expect(sections).toEqual([
      {
        name: "Shared",
        items: [expect.objectContaining({ name: "Created At" })],
      },
      {
        name: "Revenue",
        items: [expect.objectContaining({ name: "Category" })],
      },
      {
        name: "Orders",
        items: [expect.objectContaining({ name: "Status" })],
      },
    ]);
  });
});
