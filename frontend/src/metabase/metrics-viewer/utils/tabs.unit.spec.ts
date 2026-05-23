import type { MetricSourceId } from "../types/viewer-state";

import {
  createMetricMetadata,
  createMockMetricDimension,
  createMockNormalizedMetric,
  setupDefinition,
} from "./__tests__/test-helpers";
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
