import * as LibMetric from "metabase-lib/metric";

import {
  REVENUE_METRIC,
  createMetricMetadata,
  setupDefinition,
  setupDefinitionWithDateFilter,
} from "../../utils/__tests__/test-helpers";

import { getFilterDisplayParts } from "./utils";

const metadata = createMetricMetadata([REVENUE_METRIC]);

describe("getFilterDisplayParts", () => {
  afterEach(() => jest.restoreAllMocks());

  it.each(["second", "millisecond", "day"] as const)(
    "displays relative %s filters",
    (unit) => {
      const definition = setupDefinition(metadata, REVENUE_METRIC.id);
      const [dimension] = LibMetric.filterableDimensions(definition);
      const filter = LibMetric.relativeDateFilterClause({
        dimension,
        unit,
        value: -2,
      });
      expect(getFilterDisplayParts(definition, filter)).toEqual({
        label: "Created At:",
        value: `Previous 2 ${unit}s`,
      });
    },
  );

  it("does not crash on an unreadable persisted date", () => {
    const { definition, filter } =
      setupDefinitionWithDateFilter("Invalid Date");
    expect(getFilterDisplayParts(definition, filter)).toEqual({
      label: "Unknown filter",
      value: null,
    });
  });

  it("uses the short dimension name for filter pills (UXW-4849)", () => {
    const definition = setupDefinition(metadata, REVENUE_METRIC.id);
    const dimension = LibMetric.filterableDimensions(definition).find(
      (dimension) =>
        LibMetric.displayInfo(definition, dimension).displayName === "Category",
    );

    expect(dimension).toBeDefined();
    if (!dimension) {
      return;
    }

    const filter = LibMetric.stringFilterClause({
      operator: "=",
      dimension,
      values: ["Doohickey", "Gadget"],
      options: {},
    });
    const displayInfo = LibMetric.displayInfo(definition, dimension);
    jest.spyOn(LibMetric, "displayInfo").mockReturnValue({
      ...displayInfo,
      displayName: "Category",
      longDisplayName: "Product → Category",
    });

    expect(getFilterDisplayParts(definition, filter)).toEqual({
      label: "Category is:",
      value: "Doohickey, Gadget",
    });
  });
});
