import { createMockMetadata } from "__support__/metadata";
import { getDateFilterDisplayName } from "metabase/querying/common/utils/dates";
import * as LibMetric from "metabase-lib/metric";
import {
  createMockMetric,
  createMockMetricDimension,
} from "metabase-types/api/mocks/metric";

import {
  getDateFilterClause,
  getDateFilterDisplayValue,
  getDatePickerValue,
} from "./dates";

function setup() {
  const metric = createMockMetric({
    id: 1,
    dimensions: [
      createMockMetricDimension({
        id: "00000000-0000-0000-0000-000000000001",
        effective_type: "type/DateTime",
      }),
    ],
  });
  const metadata = createMockMetadata();
  metadata.metrics = { [metric.id]: metric };
  const provider = LibMetric.metadataProvider(metadata);
  const definition = LibMetric.fromJsMetricDefinition(provider, {
    expression: [
      "metric",
      { "lib/uuid": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" },
      metric.id,
    ],
  });
  const [dimension] = LibMetric.filterableDimensions(definition);
  return { definition, dimension };
}

describe("metric relative date boundaries", () => {
  it.each(["second", "millisecond"] as const)(
    "preserves %s filters for display without putting them in the seven-unit picker",
    (unit) => {
      const { definition, dimension } = setup();
      const clause = LibMetric.relativeDateFilterClause({
        dimension,
        unit,
        value: -2,
      });
      const parts = LibMetric.relativeDateFilterParts(definition, clause);
      expect(parts?.unit).toBe(unit);
      expect(getDatePickerValue(definition, clause)).toBeUndefined();
      const displayValue = getDateFilterDisplayValue(definition, clause);
      expect(displayValue && getDateFilterDisplayName(displayValue)).toBe(
        `Previous 2 ${unit}s`,
      );
    },
  );

  it("does not expose an unsupported offset unit through the picker", () => {
    const { definition, dimension } = setup();
    const clause = LibMetric.relativeDateFilterClause({
      dimension,
      unit: "day",
      value: -2,
      offsetUnit: "second",
      offsetValue: -1,
    });
    expect(getDatePickerValue(definition, clause)).toBeUndefined();
    const displayValue = getDateFilterDisplayValue(definition, clause);
    expect(displayValue && getDateFilterDisplayName(displayValue)).toBe(
      "Previous 2 days, starting 1 second ago",
    );
  });

  it("keeps supported picker units and an omitted includeCurrent flag", () => {
    const { definition, dimension } = setup();
    const clause = getDateFilterClause(dimension, {
      type: "relative",
      unit: "day",
      value: -2,
    });
    expect(getDatePickerValue(definition, clause)).toEqual({
      type: "relative",
      unit: "day",
      value: -2,
      offsetUnit: undefined,
      offsetValue: undefined,
      options: undefined,
    });
    expect(
      LibMetric.relativeDateFilterParts(definition, clause)?.options,
    ).toBeNull();
  });
});
