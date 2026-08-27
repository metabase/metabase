import * as LibMetric from "metabase-lib/metric";

import {
  REVENUE_METRIC,
  TOTAL_MEASURE,
  createMetricMetadata,
  measureMetadata,
  setupDefinition,
  setupMeasureDefinition,
} from "./__tests__/test-helpers";
import type { DimensionFilterValue } from "./dimension-filters";
import {
  buildDimensionFilterClause,
  extractDefinitionFilters,
  parseFilter,
} from "./dimension-filters";

const metadata = createMetricMetadata([REVENUE_METRIC]);

function getFilterableDimension(
  definition: LibMetric.MetricDefinition,
  displayName: string,
) {
  const dimensions = LibMetric.filterableDimensions(definition);
  const dimension = dimensions.find(
    (dimension) =>
      LibMetric.displayInfo(definition, dimension).displayName === displayName,
  );
  if (!dimension) {
    throw new Error(`Filterable dimension "${displayName}" not found`);
  }
  return dimension;
}

describe("extractDefinitionFilters", () => {
  describe("metric", () => {
    it("returns empty array for definition with no filters", () => {
      const definition = setupDefinition(metadata, REVENUE_METRIC.id);
      expect(extractDefinitionFilters(definition)).toEqual([]);
    });

    it("returns serialized string filter after one is applied", () => {
      const definition = setupDefinition(metadata, REVENUE_METRIC.id);
      const dimension = getFilterableDimension(definition, "Category");

      const filterValue: DimensionFilterValue = {
        type: "string",
        operator: "=",
        values: ["Gadget"],
        options: {},
      };
      const clause = buildDimensionFilterClause(dimension, filterValue);
      const withFilter = LibMetric.filter(definition, clause);

      const result = extractDefinitionFilters(withFilter);
      expect(result).toMatchObject([
        { value: { type: "string", operator: "=", values: ["Gadget"] } },
      ]);
    });

    it("returns serialized number filter after one is applied", () => {
      const definition = setupDefinition(metadata, REVENUE_METRIC.id);
      const dimension = getFilterableDimension(definition, "Amount");

      const filterValue: DimensionFilterValue = {
        type: "number",
        operator: "between",
        values: [10, 100],
      };
      const clause = buildDimensionFilterClause(dimension, filterValue);
      const withFilter = LibMetric.filter(definition, clause);

      const result = extractDefinitionFilters(withFilter);
      expect(result).toMatchObject([
        { value: { type: "number", operator: "between", values: [10, 100] } },
      ]);
    });
  });

  describe("measure", () => {
    it("returns empty array for definition with no filters", () => {
      const definition = setupMeasureDefinition(
        measureMetadata,
        TOTAL_MEASURE.id,
      );
      expect(extractDefinitionFilters(definition)).toEqual([]);
    });

    it("returns serialized number filter after one is applied", () => {
      const definition = setupMeasureDefinition(
        measureMetadata,
        TOTAL_MEASURE.id,
      );
      const dimension = getFilterableDimension(definition, "Quantity");

      const filterValue: DimensionFilterValue = {
        type: "number",
        operator: "between",
        values: [1, 50],
      };
      const clause = buildDimensionFilterClause(dimension, filterValue);
      const withFilter = LibMetric.filter(definition, clause);

      const result = extractDefinitionFilters(withFilter);
      expect(result).toMatchObject([
        { value: { type: "number", operator: "between", values: [1, 50] } },
      ]);
    });
  });
});

describe("parseFilter", () => {
  describe("metric", () => {
    it("parses string filter (= operator)", () => {
      const definition = setupDefinition(metadata, REVENUE_METRIC.id);
      const dimension = getFilterableDimension(definition, "Category");

      const clause = buildDimensionFilterClause(dimension, {
        type: "string",
        operator: "=",
        values: ["Gadget"],
        options: {},
      });

      const parsed = parseFilter(definition, clause);
      expect(parsed?.value).toMatchObject({
        type: "string",
        operator: "=",
        values: ["Gadget"],
      });
    });

    it("parses number filter (between operator)", () => {
      const definition = setupDefinition(metadata, REVENUE_METRIC.id);
      const dimension = getFilterableDimension(definition, "Amount");

      const clause = buildDimensionFilterClause(dimension, {
        type: "number",
        operator: "between",
        values: [10, 100],
      });

      const parsed = parseFilter(definition, clause);
      expect(parsed?.value).toMatchObject({
        type: "number",
        operator: "between",
        values: [10, 100],
      });
    });

    it("parses boolean filter (= operator)", () => {
      const definition = setupDefinition(metadata, REVENUE_METRIC.id);
      const dimension = getFilterableDimension(definition, "Is Active");

      const clause = buildDimensionFilterClause(dimension, {
        type: "boolean",
        operator: "=",
        values: [true],
      });

      const parsed = parseFilter(definition, clause);
      expect(parsed?.value).toMatchObject({
        type: "boolean",
        operator: "=",
        values: [true],
      });
    });
  });

  describe("measure", () => {
    it("parses number filter (between operator)", () => {
      const definition = setupMeasureDefinition(
        measureMetadata,
        TOTAL_MEASURE.id,
      );
      const dimension = getFilterableDimension(definition, "Quantity");

      const clause = buildDimensionFilterClause(dimension, {
        type: "number",
        operator: "between",
        values: [1, 50],
      });

      const parsed = parseFilter(definition, clause);
      expect(parsed?.value).toMatchObject({
        type: "number",
        operator: "between",
        values: [1, 50],
      });
    });
  });
});

describe("buildDimensionFilterClause", () => {
  describe("metric", () => {
    it("builds string filter clause", () => {
      const definition = setupDefinition(metadata, REVENUE_METRIC.id);
      const dimension = getFilterableDimension(definition, "Category");

      const clause = buildDimensionFilterClause(dimension, {
        type: "string",
        operator: "=",
        values: ["Gadget"],
        options: {},
      });

      const parts = LibMetric.stringFilterParts(definition, clause);
      expect(parts).toMatchObject({ operator: "=", values: ["Gadget"] });
    });

    it("builds number filter clause", () => {
      const definition = setupDefinition(metadata, REVENUE_METRIC.id);
      const dimension = getFilterableDimension(definition, "Amount");

      const clause = buildDimensionFilterClause(dimension, {
        type: "number",
        operator: "between",
        values: [10, 100],
      });

      const parts = LibMetric.numberFilterParts(definition, clause);
      expect(parts).toMatchObject({ operator: "between", values: [10, 100] });
    });

    it("builds boolean filter clause", () => {
      const definition = setupDefinition(metadata, REVENUE_METRIC.id);
      const dimension = getFilterableDimension(definition, "Is Active");

      const clause = buildDimensionFilterClause(dimension, {
        type: "boolean",
        operator: "=",
        values: [true],
      });

      const parts = LibMetric.booleanFilterParts(definition, clause);
      expect(parts).toMatchObject({ operator: "=", values: [true] });
    });
  });
});
