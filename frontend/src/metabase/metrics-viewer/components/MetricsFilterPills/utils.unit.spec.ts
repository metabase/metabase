import * as LibMetric from "metabase-lib/metric";

import {
  REVENUE_METRIC,
  createMetricMetadata,
  setupDefinition,
} from "../../utils/__tests__/test-helpers";

import { getFilterDisplayParts } from "./utils";

const metadata = createMetricMetadata([REVENUE_METRIC]);

describe("getFilterDisplayParts", () => {
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
