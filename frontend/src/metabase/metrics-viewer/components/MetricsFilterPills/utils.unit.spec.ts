import {
  getDateFilterClause,
  getDatePickerValue,
} from "metabase/common/metrics/utils/dates";
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
      expect(LibMetric.relativeDateFilterParts(definition, filter)?.unit).toBe(
        unit,
      );
      expect(getDatePickerValue(definition, filter)).toEqual(
        unit === "day"
          ? {
              type: "relative",
              unit,
              value: -2,
              offsetUnit: undefined,
              offsetValue: undefined,
              options: undefined,
            }
          : undefined,
      );
    },
  );

  it("displays unsupported offset units without exposing them in the picker", () => {
    const definition = setupDefinition(metadata, REVENUE_METRIC.id);
    const [dimension] = LibMetric.filterableDimensions(definition);
    const filter = LibMetric.relativeDateFilterClause({
      dimension,
      unit: "day",
      value: -2,
      offsetUnit: "second",
      offsetValue: -1,
    });
    expect(getDatePickerValue(definition, filter)).toBeUndefined();
    expect(getFilterDisplayParts(definition, filter)).toEqual({
      label: "Created At:",
      value: "Previous 2 days, starting 1 second ago",
    });
  });

  it("keeps supported picker units and an omitted includeCurrent flag", () => {
    const definition = setupDefinition(metadata, REVENUE_METRIC.id);
    const [dimension] = LibMetric.filterableDimensions(definition);
    const filter = getDateFilterClause(dimension, {
      type: "relative",
      unit: "day",
      value: -2,
    });
    expect(getDatePickerValue(definition, filter)).toEqual({
      type: "relative",
      unit: "day",
      value: -2,
      offsetUnit: undefined,
      offsetValue: undefined,
      options: undefined,
    });
    expect(
      LibMetric.relativeDateFilterParts(definition, filter)?.options,
    ).toBeNull();
  });

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
