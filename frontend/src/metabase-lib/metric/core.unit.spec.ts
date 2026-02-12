import Metadata from "metabase-lib/v1/metadata/Metadata";
import Metric from "metabase-lib/v1/metadata/Metric";
import type { JsMetricDefinition } from "metabase-types/api";
import {
  createMockMetric,
  createMockMetricDimension,
} from "metabase-types/api/mocks/metric";

import * as LibMetric from "./core";
import type {
  MetadataProvider,
  MetricDefinition,
  MetricMetadata,
} from "./types";

const SAMPLE_METRIC = createMockMetric({
  id: 1,
  name: "Revenue",
  description: "Total revenue",
  dimensions: [
    createMockMetricDimension({
      id: "dim-1",
      display_name: "Created At",
      effective_type: "type/DateTime",
      semantic_type: "type/CreationTimestamp",
    }),
    createMockMetricDimension({
      id: "dim-2",
      display_name: "Category",
      effective_type: "type/Text",
      semantic_type: "type/Category",
    }),
    {
      ...createMockMetricDimension({
        id: "dim-3",
        display_name: "Amount",
        effective_type: "type/Float",
        semantic_type: "type/Currency",
      }),
      sources: [{ type: "field", "field-id": 5 }],
    } as any,
    createMockMetricDimension({
      id: "dim-4",
      display_name: "Is Active",
      effective_type: "type/Boolean",
      semantic_type: null,
    }),
    createMockMetricDimension({
      id: "dim-5",
      display_name: "Latitude",
      effective_type: "type/Float",
      semantic_type: "type/Latitude",
    }),
    createMockMetricDimension({
      id: "dim-6",
      display_name: "Longitude",
      effective_type: "type/Float",
      semantic_type: "type/Longitude",
    }),
    createMockMetricDimension({
      id: "dim-7",
      display_name: "Event Time",
      effective_type: "type/Time",
      semantic_type: null,
    }),
  ],
});

// Dimension indices for easy reference
const DIM_IDX = {
  DATE_TIME: 0, // Created At - type/DateTime
  STRING: 1, // Category - type/Text
  NUMBER: 2, // Amount - type/Float
  BOOLEAN: 3, // Is Active - type/Boolean
  LATITUDE: 4, // Latitude - type/Float with type/Latitude semantic
  LONGITUDE: 5, // Longitude - type/Float with type/Longitude semantic
  TIME: 6, // Event Time - type/Time
};

function createSampleMetadata(): Metadata {
  const metadata = new Metadata();

  // Add the metric to the metadata object
  const metricInstance = new Metric(SAMPLE_METRIC as any);
  metricInstance.metadata = metadata;
  metadata.metrics = {
    [SAMPLE_METRIC.id]: metricInstance,
  };

  return metadata;
}

/**
 * Helper to set up a definition from SAMPLE_METRIC.
 * Returns provider, metricMeta, and definition.
 */
function setupDefinition(): {
  provider: MetadataProvider;
  metricMeta: MetricMetadata;
  definition: MetricDefinition;
} {
  const metadata = createSampleMetadata();
  const provider = LibMetric.metadataProvider(metadata);
  const metricMeta = LibMetric.metricMetadata(provider, SAMPLE_METRIC.id);
  expect(metricMeta).not.toBeNull();
  const definition = LibMetric.fromMetricMetadata(provider, metricMeta!);
  return { provider, metricMeta: metricMeta!, definition };
}

describe("metabase-lib/metric/core", () => {
  describe("metadataProvider", () => {
    it("should create a metadata provider from JS metadata", () => {
      const metadata = createSampleMetadata();
      const provider = LibMetric.metadataProvider(metadata);
      expect(provider).toBeDefined();
    });
  });

  describe("metricMetadata", () => {
    it("should return metric metadata for a valid metric ID", () => {
      const metadata = createSampleMetadata();
      const provider = LibMetric.metadataProvider(metadata);
      const metricMeta = LibMetric.metricMetadata(provider, SAMPLE_METRIC.id);

      expect(metricMeta).not.toBeNull();
    });

    it("should return null for an invalid metric ID", () => {
      const metadata = createSampleMetadata();
      const provider = LibMetric.metadataProvider(metadata);
      const metricMeta = LibMetric.metricMetadata(provider, 999);

      expect(metricMeta).toBeNull();
    });
  });

  describe("fromMetricMetadata", () => {
    it("should create a MetricDefinition from metric metadata", () => {
      const { definition } = setupDefinition();
      expect(definition).toBeDefined();
    });
  });

  describe("sourceMetricId", () => {
    it("should return the source metric ID for a metric-based definition", () => {
      const { definition } = setupDefinition();
      const sourceId = LibMetric.sourceMetricId(definition);
      expect(sourceId).toBe(SAMPLE_METRIC.id);
    });
  });

  describe("sourceMeasureId", () => {
    it("should return null for a metric-based definition", () => {
      const { definition } = setupDefinition();
      const sourceId = LibMetric.sourceMeasureId(definition);
      expect(sourceId).toBeNull();
    });
  });

  describe("filters", () => {
    it("should return filters for a new definition (empty by default)", () => {
      const { definition } = setupDefinition();
      const filterClauses = LibMetric.filters(definition);

      expect(filterClauses).toBeDefined();
      expect(filterClauses.length).toBe(0);
    });
  });

  describe("projections", () => {
    it("should return projections for a new definition (empty by default)", () => {
      const { definition } = setupDefinition();
      const projectionClauses = LibMetric.projections(definition);

      expect(projectionClauses).toBeDefined();
      expect(projectionClauses.length).toBe(0);
    });
  });

  describe("filterableDimensions", () => {
    it("should return filterable dimensions for a definition", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);

      expect(dimensions).toBeDefined();
      expect(typeof dimensions.length).toBe("number");
    });

    it("should return dimensions matching the metric's dimensions", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);

      // The metric has 2 dimensions defined
      expect(dimensions.length).toBe(SAMPLE_METRIC.dimensions!.length);
    });

    it("should include filter-positions in dimension display info", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);

      expect(dimensions.length).toBeGreaterThan(0);
      const info = LibMetric.displayInfo(definition, dimensions[0]);

      // filterPositions should be an array (empty for a new definition with no filters)
      expect(info.filterPositions).toBeDefined();
      expect(Array.isArray(info.filterPositions)).toBe(true);
      expect(info.filterPositions).toEqual([]);
    });

    it("should return empty filter-positions for a definition with no filters", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);

      // All dimensions should have empty filter-positions since no filters are applied
      dimensions.forEach((dimension) => {
        const info = LibMetric.displayInfo(definition, dimension);
        expect(info.filterPositions).toEqual([]);
      });
    });
  });

  describe("projectionableDimensions", () => {
    it("should return projectionable dimensions for a definition", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.projectionableDimensions(definition);

      expect(dimensions).toBeDefined();
      expect(typeof dimensions.length).toBe("number");
    });
  });

  describe("project", () => {
    it("should add a projection to the definition", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.projectionableDimensions(definition);
      expect(dimensions.length).toBeGreaterThan(0);

      const updatedDefinition = LibMetric.project(definition, dimensions[0]);
      const projectionClauses = LibMetric.projections(updatedDefinition);

      expect(projectionClauses.length).toBe(1);
    });

    it("should allow adding multiple projections", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.projectionableDimensions(definition);
      expect(dimensions.length).toBeGreaterThan(1);

      let updatedDefinition = LibMetric.project(definition, dimensions[0]);
      updatedDefinition = LibMetric.project(updatedDefinition, dimensions[1]);
      const projectionClauses = LibMetric.projections(updatedDefinition);

      expect(projectionClauses.length).toBe(2);
    });
  });

  describe("projectionDimension", () => {
    it("should return the dimension for a projection clause", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.projectionableDimensions(definition);
      expect(dimensions.length).toBeGreaterThan(0);

      const updatedDefinition = LibMetric.project(definition, dimensions[0]);
      const projectionClauses = LibMetric.projections(updatedDefinition);
      expect(projectionClauses.length).toBe(1);

      const dimension = LibMetric.projectionDimension(
        updatedDefinition,
        projectionClauses[0],
      );
      expect(dimension).not.toBeNull();

      // Verify it's the same dimension we projected
      const info = LibMetric.displayInfo(updatedDefinition, dimension!);
      const originalInfo = LibMetric.displayInfo(
        updatedDefinition,
        dimensions[0],
      );
      expect(info.displayName).toBe(originalInfo.displayName);
    });
  });

  describe("displayInfo", () => {
    it("should return display info for metric metadata", () => {
      const { definition, metricMeta } = setupDefinition();
      const info = LibMetric.displayInfo(definition, metricMeta);

      expect(info).toBeDefined();
      expect(info.displayName).toBeDefined();
    });

    it("should return display info with filterPositions for dimensions", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);

      expect(dimensions.length).toBeGreaterThan(0);
      const info = LibMetric.displayInfo(definition, dimensions[0]);

      expect(info).toBeDefined();
      expect(info.displayName).toBeDefined();
      expect(info.filterPositions).toBeDefined();
      expect(info.projectionPositions).toBeDefined();
    });
  });

  describe("availableTemporalBuckets", () => {
    it("should return available temporal buckets for a dimension", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);

      expect(dimensions.length).toBeGreaterThan(0);
      const buckets = LibMetric.availableTemporalBuckets(
        definition,
        dimensions[0],
      );
      expect(buckets).toBeDefined();
      expect(typeof buckets.length).toBe("number");
    });
  });

  describe("isTemporalBucketable", () => {
    it("should check if a dimension can have temporal buckets applied", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);

      expect(dimensions.length).toBeGreaterThan(0);
      const result = LibMetric.isTemporalBucketable(definition, dimensions[0]);
      expect(typeof result).toBe("boolean");
    });
  });

  describe("withTemporalBucket", () => {
    it("should apply a temporal bucket to a projection clause", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.projectionableDimensions(definition);
      const dateDimension = dimensions[DIM_IDX.DATE_TIME];

      const updatedDefinition = LibMetric.project(definition, dateDimension);
      const projections = LibMetric.projections(updatedDefinition);
      expect(projections.length).toBe(1);

      const buckets = LibMetric.availableTemporalBuckets(
        updatedDefinition,
        dateDimension,
      );
      expect(buckets.length).toBeGreaterThan(0);

      const bucketed = LibMetric.withTemporalBucket(projections[0], buckets[0]);
      expect(bucketed).toBeDefined();

      const bucketInfo = LibMetric.temporalBucket(bucketed);
      expect(bucketInfo).not.toBeNull();
    });

    it("should accept a dimension metadata directly (not just projection clause)", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.projectionableDimensions(definition);
      const dateDimension = dimensions[DIM_IDX.DATE_TIME];

      const buckets = LibMetric.availableTemporalBuckets(
        definition,
        dateDimension,
      );
      expect(buckets.length).toBeGreaterThan(0);

      // Pass dimension metadata directly instead of a projection clause
      const bucketed = LibMetric.withTemporalBucket(dateDimension, buckets[0]);
      expect(bucketed).toBeDefined();

      const bucketInfo = LibMetric.temporalBucket(bucketed);
      expect(bucketInfo).not.toBeNull();
    });

    it("should remove temporal bucket when passed null", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.projectionableDimensions(definition);
      const dateDimension = dimensions[DIM_IDX.DATE_TIME];

      const buckets = LibMetric.availableTemporalBuckets(
        definition,
        dateDimension,
      );
      expect(buckets.length).toBeGreaterThan(0);

      const bucketed = LibMetric.withTemporalBucket(dateDimension, buckets[0]);
      const unbucketed = LibMetric.withTemporalBucket(bucketed, null);

      const bucketInfo = LibMetric.temporalBucket(unbucketed);
      expect(bucketInfo).toBeNull();
    });
  });

  describe("availableBinningStrategies", () => {
    it("should return available binning strategies for a dimension", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);

      expect(dimensions.length).toBeGreaterThan(0);
      const strategies = LibMetric.availableBinningStrategies(
        definition,
        dimensions[0],
      );
      expect(strategies).toBeDefined();
      expect(typeof strategies.length).toBe("number");
    });
  });

  describe("isBinnable", () => {
    it("should check if a dimension can have binning applied", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);

      expect(dimensions.length).toBeGreaterThan(0);
      const result = LibMetric.isBinnable(definition, dimensions[0]);
      expect(typeof result).toBe("boolean");
    });
  });

  describe("withBinning", () => {
    it("should apply binning to a projection clause", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.projectionableDimensions(definition);
      const numericDimension = dimensions[DIM_IDX.NUMBER];

      const updatedDefinition = LibMetric.project(definition, numericDimension);
      const projectionClauses = LibMetric.projections(updatedDefinition);
      expect(projectionClauses.length).toBe(1);

      const strategies = LibMetric.availableBinningStrategies(
        updatedDefinition,
        numericDimension,
      );
      expect(strategies.length).toBeGreaterThan(0);

      const binned = LibMetric.withBinning(projectionClauses[0], strategies[0]);
      expect(binned).toBeDefined();
      expect(LibMetric.binning(binned)).not.toBeNull();
    });

    it("should accept a dimension metadata directly (not just projection clause)", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.projectionableDimensions(definition);
      const numericDimension = dimensions[DIM_IDX.NUMBER];

      const strategies = LibMetric.availableBinningStrategies(
        definition,
        numericDimension,
      );
      expect(strategies.length).toBeGreaterThan(0);

      // Pass dimension metadata directly instead of a projection clause
      const binned = LibMetric.withBinning(numericDimension, strategies[0]);
      expect(binned).toBeDefined();
      expect(LibMetric.binning(binned)).not.toBeNull();
    });

    it("should remove binning when passed null", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.projectionableDimensions(definition);
      const numericDimension = dimensions[DIM_IDX.NUMBER];

      const strategies = LibMetric.availableBinningStrategies(
        definition,
        numericDimension,
      );
      expect(strategies.length).toBeGreaterThan(0);

      const binned = LibMetric.withBinning(numericDimension, strategies[0]);
      const unbinned = LibMetric.withBinning(binned, null);
      expect(LibMetric.binning(unbinned)).toBeNull();
    });
  });

  describe("type checking functions", () => {
    it("isBoolean should return a boolean", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);

      expect(dimensions.length).toBeGreaterThan(0);
      expect(typeof LibMetric.isBoolean(dimensions[0])).toBe("boolean");
    });

    it("isNumeric should return a boolean", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);

      expect(dimensions.length).toBeGreaterThan(0);
      expect(typeof LibMetric.isNumeric(dimensions[0])).toBe("boolean");
    });

    it("isTemporal should return a boolean", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);

      expect(dimensions.length).toBeGreaterThan(0);
      expect(typeof LibMetric.isTemporal(dimensions[0])).toBe("boolean");
    });

    it("isStringLike should return a boolean", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);

      expect(dimensions.length).toBeGreaterThan(0);
      expect(typeof LibMetric.isStringLike(dimensions[0])).toBe("boolean");
    });
  });

  describe("toJsMetricDefinition and fromJsMetricDefinition", () => {
    it("should round-trip a metric definition through JS format", () => {
      const { provider, definition } = setupDefinition();
      const jsDefinition = LibMetric.toJsMetricDefinition(definition);

      expect(jsDefinition).toBeDefined();
      // New format uses expression instead of source-metric
      const jsObj = jsDefinition as Record<string, unknown>;
      expect(jsObj["expression"]).toBeDefined();
      const expression = jsObj["expression"] as unknown[];
      expect(expression[0]).toBe("metric");
      expect(expression[2]).toBe(SAMPLE_METRIC.id);

      const roundTripped = LibMetric.fromJsMetricDefinition(
        provider,
        jsDefinition,
      );
      expect(LibMetric.sourceMetricId(roundTripped)).toBe(SAMPLE_METRIC.id);
    });
  });

  describe("filterParts", () => {
    it("should return null for clauses that do not match any filter type", () => {
      const { definition } = setupDefinition();
      const filterClauses = LibMetric.filters(definition);

      // New definition has no filters
      expect(filterClauses).toBeDefined();
      expect(filterClauses.length).toBe(0);
    });
  });

  describe("stringFilterClause", () => {
    it("should create a string filter clause from parts", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      expect(dimensions.length).toBeGreaterThan(0);

      // Use the second dimension which is the Category (type/Text)
      const stringDimension = dimensions[1];

      const parts = {
        operator: "=" as const,
        dimension: stringDimension!,
        values: ["Electronics", "Clothing"],
        options: {},
      };

      const clause = LibMetric.stringFilterClause(parts);
      expect(clause).toBeDefined();
    });

    it("should create contains filter with options", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const stringDimension = dimensions[1];

      const parts = {
        operator: "contains" as const,
        dimension: stringDimension!,
        values: ["search term"],
        options: { caseSensitive: false },
      };

      const clause = LibMetric.stringFilterClause(parts);
      expect(clause).toBeDefined();
    });
  });

  describe("numberFilterClause", () => {
    it("should create a number filter clause from parts", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);

      // Use any dimension for the test - actual type checking happens in CLJS
      const dimension = dimensions[0];
      expect(dimension).toBeDefined();

      const parts = {
        operator: "between" as const,
        dimension: dimension!,
        values: [10, 100],
      };

      const clause = LibMetric.numberFilterClause(parts);
      expect(clause).toBeDefined();
    });

    it("should create comparison filter", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const dimension = dimensions[0];

      const parts = {
        operator: ">" as const,
        dimension: dimension!,
        values: [50],
      };

      const clause = LibMetric.numberFilterClause(parts);
      expect(clause).toBeDefined();
    });
  });

  describe("booleanFilterClause", () => {
    it("should create a boolean filter clause from parts", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const dimension = dimensions[0];

      const parts = {
        operator: "=" as const,
        dimension: dimension!,
        values: [true],
      };

      const clause = LibMetric.booleanFilterClause(parts);
      expect(clause).toBeDefined();
    });

    it("should create null check clause", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const dimension = dimensions[0];

      const parts = {
        operator: "is-null" as const,
        dimension: dimension!,
        values: [],
      };

      const clause = LibMetric.booleanFilterClause(parts);
      expect(clause).toBeDefined();
    });
  });

  describe("defaultFilterClause", () => {
    it("should create an is-null filter clause", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const dimension = dimensions[0];

      const parts = {
        operator: "is-null" as const,
        dimension: dimension!,
      };

      const clause = LibMetric.defaultFilterClause(parts);
      expect(clause).toBeDefined();
    });

    it("should create a not-null filter clause", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const dimension = dimensions[0];

      const parts = {
        operator: "not-null" as const,
        dimension: dimension!,
      };

      const clause = LibMetric.defaultFilterClause(parts);
      expect(clause).toBeDefined();
    });
  });

  describe("specificDateFilterClause", () => {
    it("should create a date filter clause", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      expect(dimensions.length).toBeGreaterThan(0);

      // Use the first dimension which is Created At (type/DateTime)
      const dateDimension = dimensions[0];

      const parts = {
        operator: "=" as const,
        dimension: dateDimension!,
        values: [new Date("2024-01-15")],
        hasTime: false,
      };

      const clause = LibMetric.specificDateFilterClause(parts);
      expect(clause).toBeDefined();
    });

    it("should create a between date filter", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const dateDimension = dimensions[0];

      const parts = {
        operator: "between" as const,
        dimension: dateDimension!,
        values: [new Date("2024-01-01"), new Date("2024-12-31")],
        hasTime: false,
      };

      const clause = LibMetric.specificDateFilterClause(parts);
      expect(clause).toBeDefined();
    });
  });

  describe("relativeDateFilterClause", () => {
    it("should create a relative date filter clause", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      // Use first dimension (Created At - datetime)
      const dateDimension = dimensions[0];

      const parts = {
        dimension: dateDimension!,
        unit: "day" as const,
        value: -30,
        offsetUnit: null,
        offsetValue: null,
        options: {},
      };

      const clause = LibMetric.relativeDateFilterClause(parts);
      expect(clause).toBeDefined();
    });

    it("should create a relative date filter with offset", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const dateDimension = dimensions[0];

      const parts = {
        dimension: dateDimension!,
        unit: "day" as const,
        value: -7,
        offsetUnit: "week" as const,
        offsetValue: -1,
        options: { includeCurrent: true },
      };

      const clause = LibMetric.relativeDateFilterClause(parts);
      expect(clause).toBeDefined();
    });
  });

  describe("timeFilterClause", () => {
    it("should create a time filter clause", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const dimension = dimensions[0];

      const parts = {
        operator: ">" as const,
        dimension: dimension!,
        values: [new Date("1970-01-01T09:00:00")],
      };

      const clause = LibMetric.timeFilterClause(parts);
      expect(clause).toBeDefined();
    });

    it("should create a between time filter", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const dimension = dimensions[0];

      const parts = {
        operator: "between" as const,
        dimension: dimension!,
        values: [
          new Date("1970-01-01T09:00:00"),
          new Date("1970-01-01T17:00:00"),
        ],
      };

      const clause = LibMetric.timeFilterClause(parts);
      expect(clause).toBeDefined();
    });
  });

  describe("coordinateFilterClause", () => {
    it("should create a coordinate filter clause", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const dimension = dimensions[0];

      const parts = {
        operator: "=" as const,
        dimension: dimension!,
        longitudeDimension: null,
        values: [40.7128],
      };

      const clause = LibMetric.coordinateFilterClause(parts);
      expect(clause).toBeDefined();
    });
  });

  describe("excludeDateFilterClause", () => {
    it("should create an exclude date filter clause", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      // Use first dimension (Created At - datetime)
      const dateDimension = dimensions[0];

      const parts = {
        operator: "!=" as const,
        dimension: dateDimension!,
        unit: "day-of-week" as const,
        values: [1, 7], // Exclude Sunday and Saturday
      };

      const clause = LibMetric.excludeDateFilterClause(parts);
      expect(clause).toBeDefined();
    });
  });

  describe("filter function integration", () => {
    it("should add a filter clause to a definition", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      // Use second dimension (Category - text)
      const stringDimension = dimensions[1];

      const parts = {
        operator: "=" as const,
        dimension: stringDimension!,
        values: ["Electronics"],
        options: {},
      };

      const clause = LibMetric.stringFilterClause(parts);
      const updatedDefinition = LibMetric.filter(definition, clause);

      const filterClauses = LibMetric.filters(updatedDefinition);
      expect(filterClauses.length).toBe(1);
    });

    it("should allow adding multiple filters", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const dimension = dimensions[0];

      const clause1 = LibMetric.defaultFilterClause({
        operator: "not-null" as const,
        dimension: dimension!,
      });

      const clause2 = LibMetric.defaultFilterClause({
        operator: "not-null" as const,
        dimension: dimensions[1]!,
      });

      let updatedDefinition = LibMetric.filter(definition, clause1);
      updatedDefinition = LibMetric.filter(updatedDefinition, clause2);

      const filterClauses = LibMetric.filters(updatedDefinition);
      expect(filterClauses.length).toBe(2);
    });
  });

  describe("dimensionValuesInfo", () => {
    it("should return dimension values info for a dimension", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);

      expect(dimensions.length).toBeGreaterThan(0);
      const info = LibMetric.dimensionValuesInfo(definition, dimensions[0]);
      expect(info).toBeDefined();
      expect(info.canListValues !== undefined).toBe(true);
      expect(info.canSearchValues !== undefined).toBe(true);
      expect(info.canRemapValues !== undefined).toBe(true);
    });
  });

  describe("MetadataProviderable - using MetricDefinition as provider", () => {
    it("metricMetadata should accept a MetricDefinition", () => {
      const { definition } = setupDefinition();

      // Use the definition as MetadataProviderable to look up the same metric
      const metricMetaFromDefinition = LibMetric.metricMetadata(
        definition,
        SAMPLE_METRIC.id,
      );

      expect(metricMetaFromDefinition).not.toBeNull();
    });

    it("fromMetricMetadata should accept a MetricDefinition", () => {
      const { definition, metricMeta } = setupDefinition();

      // Create a new definition using the existing definition as MetadataProviderable
      const newDefinition = LibMetric.fromMetricMetadata(
        definition,
        metricMeta,
      );

      expect(newDefinition).toBeDefined();
      expect(LibMetric.sourceMetricId(newDefinition)).toBe(SAMPLE_METRIC.id);
    });

    it("fromJsMetricDefinition should accept a MetricDefinition", () => {
      const { definition } = setupDefinition();

      // Create a new definition from expression format using the existing definition as MetadataProviderable
      const jsDefinition = {
        expression: [
          "metric",
          { "lib/uuid": "test-uuid-1234" },
          SAMPLE_METRIC.id,
        ],
      } as unknown as JsMetricDefinition;
      const newDefinition = LibMetric.fromJsMetricDefinition(
        definition,
        jsDefinition,
      );

      expect(newDefinition).toBeDefined();
      expect(LibMetric.sourceMetricId(newDefinition)).toBe(SAMPLE_METRIC.id);
    });
  });

  // ============================================================================
  // FilterParts Extraction Tests
  // ============================================================================

  describe("stringFilterParts", () => {
    it("should extract parts from equals filter clause", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const stringDimension = dimensions[1]; // Category - type/Text

      const parts = {
        operator: "=" as const,
        dimension: stringDimension,
        values: ["Electronics", "Clothing"],
        options: {},
      };

      const clause = LibMetric.stringFilterClause(parts);
      const updatedDef = LibMetric.filter(definition, clause);
      const extractedParts = LibMetric.stringFilterParts(updatedDef, clause);

      expect(extractedParts).not.toBeNull();
      expect(extractedParts?.operator).toBe("=");
      expect(extractedParts?.values).toEqual(["Electronics", "Clothing"]);
    });

    it("should extract parts from contains filter", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const stringDimension = dimensions[1];

      const parts = {
        operator: "contains" as const,
        dimension: stringDimension,
        values: ["search term"],
        options: {},
      };

      const clause = LibMetric.stringFilterClause(parts);
      const updatedDef = LibMetric.filter(definition, clause);
      const extractedParts = LibMetric.stringFilterParts(updatedDef, clause);

      expect(extractedParts).not.toBeNull();
      expect(extractedParts?.operator).toBe("contains");
      expect(extractedParts?.values).toEqual(["search term"]);
    });

    it("should extract parts from is-empty filter", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const stringDimension = dimensions[1];

      const parts = {
        operator: "is-empty" as const,
        dimension: stringDimension,
        values: [],
        options: {},
      };

      const clause = LibMetric.stringFilterClause(parts);
      const updatedDef = LibMetric.filter(definition, clause);
      const extractedParts = LibMetric.stringFilterParts(updatedDef, clause);

      expect(extractedParts).not.toBeNull();
      expect(extractedParts?.operator).toBe("is-empty");
      expect(extractedParts?.values).toEqual([]);
    });

    it("should return null for non-string dimension filter", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const dateDimension = dimensions[0]; // DateTime dimension

      // Create a default filter on a non-string dimension
      const clause = LibMetric.defaultFilterClause({
        operator: "not-null" as const,
        dimension: dateDimension,
      });
      const updatedDef = LibMetric.filter(definition, clause);

      // stringFilterParts should return null for non-string filters
      const extractedParts = LibMetric.stringFilterParts(updatedDef, clause);
      expect(extractedParts).toBeNull();
    });
  });

  describe("defaultFilterParts", () => {
    it("should extract is-null parts", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const dimension = dimensions[0];

      const parts = {
        operator: "is-null" as const,
        dimension: dimension,
      };

      const clause = LibMetric.defaultFilterClause(parts);
      const updatedDef = LibMetric.filter(definition, clause);
      const extractedParts = LibMetric.defaultFilterParts(updatedDef, clause);

      expect(extractedParts).not.toBeNull();
      expect(extractedParts?.operator).toBe("is-null");
    });

    it("should extract not-null parts", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const dimension = dimensions[0];

      const parts = {
        operator: "not-null" as const,
        dimension: dimension,
      };

      const clause = LibMetric.defaultFilterClause(parts);
      const updatedDef = LibMetric.filter(definition, clause);
      const extractedParts = LibMetric.defaultFilterParts(updatedDef, clause);

      expect(extractedParts).not.toBeNull();
      expect(extractedParts?.operator).toBe("not-null");
    });
  });

  describe("relativeDateFilterParts", () => {
    it("should extract parts from simple time-interval", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const dateDimension = dimensions[0]; // DateTime dimension

      const parts = {
        dimension: dateDimension,
        unit: "day" as const,
        value: -30,
        offsetUnit: null,
        offsetValue: null,
        options: {},
      };

      const clause = LibMetric.relativeDateFilterClause(parts);
      const updatedDef = LibMetric.filter(definition, clause);
      const extractedParts = LibMetric.relativeDateFilterParts(
        updatedDef,
        clause,
      );

      expect(extractedParts).not.toBeNull();
      expect(extractedParts?.unit).toBe("day");
      expect(extractedParts?.value).toBe(-30);
    });

    it("should extract offset values when present", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const dateDimension = dimensions[0];

      const parts = {
        dimension: dateDimension,
        unit: "day" as const,
        value: -7,
        offsetUnit: "week" as const,
        offsetValue: -1,
        options: {},
      };

      const clause = LibMetric.relativeDateFilterClause(parts);
      const updatedDef = LibMetric.filter(definition, clause);
      const extractedParts = LibMetric.relativeDateFilterParts(
        updatedDef,
        clause,
      );

      expect(extractedParts).not.toBeNull();
      expect(extractedParts?.offsetUnit).toBe("week");
      expect(extractedParts?.offsetValue).toBe(-1);
    });
  });

  describe("excludeDateFilterParts", () => {
    it("should extract day-of-week exclusion parts", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const dateDimension = dimensions[0];

      const parts = {
        operator: "!=" as const,
        dimension: dateDimension,
        unit: "day-of-week" as const,
        values: [1, 7], // Exclude Sunday and Saturday
      };

      const clause = LibMetric.excludeDateFilterClause(parts);
      const updatedDef = LibMetric.filter(definition, clause);
      const extractedParts = LibMetric.excludeDateFilterParts(
        updatedDef,
        clause,
      );

      expect(extractedParts).not.toBeNull();
      expect(extractedParts?.operator).toBe("!=");
      expect(extractedParts?.unit).toBe("day-of-week");
      expect(extractedParts?.values).toEqual([1, 7]);
    });
  });

  describe("numberFilterParts", () => {
    it("should extract parts from between filter clause", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const numericDimension = dimensions[DIM_IDX.NUMBER];

      const parts = {
        operator: "between" as const,
        dimension: numericDimension,
        values: [10, 100],
      };

      const clause = LibMetric.numberFilterClause(parts);
      const updatedDef = LibMetric.filter(definition, clause);
      const extractedParts = LibMetric.numberFilterParts(updatedDef, clause);

      expect(extractedParts).not.toBeNull();
      expect(extractedParts?.operator).toBe("between");
      expect(extractedParts?.values).toEqual([10, 100]);
    });

    it("should extract parts from greater than filter clause", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const numericDimension = dimensions[DIM_IDX.NUMBER];

      const parts = {
        operator: ">" as const,
        dimension: numericDimension,
        values: [50],
      };

      const clause = LibMetric.numberFilterClause(parts);
      const updatedDef = LibMetric.filter(definition, clause);
      const extractedParts = LibMetric.numberFilterParts(updatedDef, clause);

      expect(extractedParts).not.toBeNull();
      expect(extractedParts?.operator).toBe(">");
      expect(extractedParts?.values).toEqual([50]);
    });

    it("should extract parts from less than filter clause", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const numericDimension = dimensions[DIM_IDX.NUMBER];

      const parts = {
        operator: "<" as const,
        dimension: numericDimension,
        values: [25],
      };

      const clause = LibMetric.numberFilterClause(parts);
      const updatedDef = LibMetric.filter(definition, clause);
      const extractedParts = LibMetric.numberFilterParts(updatedDef, clause);

      expect(extractedParts).not.toBeNull();
      expect(extractedParts?.operator).toBe("<");
      expect(extractedParts?.values).toEqual([25]);
    });

    it("should extract parts from equals filter clause", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const numericDimension = dimensions[DIM_IDX.NUMBER];

      const parts = {
        operator: "=" as const,
        dimension: numericDimension,
        values: [42],
      };

      const clause = LibMetric.numberFilterClause(parts);
      const updatedDef = LibMetric.filter(definition, clause);
      const extractedParts = LibMetric.numberFilterParts(updatedDef, clause);

      expect(extractedParts).not.toBeNull();
      expect(extractedParts?.operator).toBe("=");
      expect(extractedParts?.values).toEqual([42]);
    });

    it("should return null for non-number filter clause", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const stringDimension = dimensions[1];

      const clause = LibMetric.stringFilterClause({
        operator: "=" as const,
        dimension: stringDimension,
        values: ["test"],
        options: {},
      });
      const updatedDef = LibMetric.filter(definition, clause);
      const extractedParts = LibMetric.numberFilterParts(updatedDef, clause);

      expect(extractedParts).toBeNull();
    });
  });

  describe("booleanFilterParts", () => {
    it("should extract parts from true equality filter", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const booleanDimension = dimensions[DIM_IDX.BOOLEAN];

      const parts = {
        operator: "=" as const,
        dimension: booleanDimension,
        values: [true],
      };

      const clause = LibMetric.booleanFilterClause(parts);
      const updatedDef = LibMetric.filter(definition, clause);
      const extractedParts = LibMetric.booleanFilterParts(updatedDef, clause);

      expect(extractedParts).not.toBeNull();
      expect(extractedParts?.operator).toBe("=");
      expect(extractedParts?.values).toEqual([true]);
    });

    it("should extract parts from false equality filter", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const booleanDimension = dimensions[DIM_IDX.BOOLEAN];

      const parts = {
        operator: "=" as const,
        dimension: booleanDimension,
        values: [false],
      };

      const clause = LibMetric.booleanFilterClause(parts);
      const updatedDef = LibMetric.filter(definition, clause);
      const extractedParts = LibMetric.booleanFilterParts(updatedDef, clause);

      expect(extractedParts).not.toBeNull();
      expect(extractedParts?.operator).toBe("=");
      expect(extractedParts?.values).toEqual([false]);
    });

    it("should return null for non-boolean filter clause", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const stringDimension = dimensions[1];

      const clause = LibMetric.stringFilterClause({
        operator: "=" as const,
        dimension: stringDimension,
        values: ["test"],
        options: {},
      });
      const updatedDef = LibMetric.filter(definition, clause);
      const extractedParts = LibMetric.booleanFilterParts(updatedDef, clause);

      expect(extractedParts).toBeNull();
    });
  });

  describe("coordinateFilterParts", () => {
    it("should extract parts from equals coordinate filter", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const latitudeDimension = dimensions[DIM_IDX.LATITUDE];

      const parts = {
        operator: "=" as const,
        dimension: latitudeDimension,
        longitudeDimension: null,
        values: [40.7128],
      };

      const clause = LibMetric.coordinateFilterClause(parts);
      const updatedDef = LibMetric.filter(definition, clause);
      const extractedParts = LibMetric.coordinateFilterParts(
        updatedDef,
        clause,
      );

      expect(extractedParts).not.toBeNull();
      expect(extractedParts?.operator).toBe("=");
      expect(extractedParts?.values).toEqual([40.7128]);
    });

    it("should extract parts from inside coordinate filter (bounding box)", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const latitudeDimension = dimensions[DIM_IDX.LATITUDE];
      const longitudeDimension = dimensions[DIM_IDX.LONGITUDE];

      const parts = {
        operator: "inside" as const,
        dimension: latitudeDimension,
        longitudeDimension: longitudeDimension,
        values: [40.9, 40.5, -73.7, -74.1], // north, south, east, west
      };

      const clause = LibMetric.coordinateFilterClause(parts);
      const updatedDef = LibMetric.filter(definition, clause);
      const extractedParts = LibMetric.coordinateFilterParts(
        updatedDef,
        clause,
      );

      expect(extractedParts).not.toBeNull();
      expect(extractedParts?.operator).toBe("inside");
      expect(extractedParts?.values).toEqual([40.9, 40.5, -73.7, -74.1]);
    });

    it("should return null for non-coordinate filter clause", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const stringDimension = dimensions[1];

      const clause = LibMetric.stringFilterClause({
        operator: "=" as const,
        dimension: stringDimension,
        values: ["test"],
        options: {},
      });
      const updatedDef = LibMetric.filter(definition, clause);
      const extractedParts = LibMetric.coordinateFilterParts(
        updatedDef,
        clause,
      );

      expect(extractedParts).toBeNull();
    });
  });

  describe("specificDateFilterParts", () => {
    it("should extract parts from equals date filter", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const dateDimension = dimensions[0]; // DateTime dimension

      const testDate = new Date("2024-01-15");
      const parts = {
        operator: "=" as const,
        dimension: dateDimension,
        values: [testDate],
        hasTime: false,
      };

      const clause = LibMetric.specificDateFilterClause(parts);
      const updatedDef = LibMetric.filter(definition, clause);
      const extractedParts = LibMetric.specificDateFilterParts(
        updatedDef,
        clause,
      );

      expect(extractedParts).not.toBeNull();
      expect(extractedParts?.operator).toBe("=");
      expect(extractedParts?.hasTime).toBe(false);
      expect(extractedParts?.values.length).toBe(1);
    });

    it("should extract parts from between date filter", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const dateDimension = dimensions[0];

      const startDate = new Date("2024-01-01");
      const endDate = new Date("2024-12-31");
      const parts = {
        operator: "between" as const,
        dimension: dateDimension,
        values: [startDate, endDate],
        hasTime: false,
      };

      const clause = LibMetric.specificDateFilterClause(parts);
      const updatedDef = LibMetric.filter(definition, clause);
      const extractedParts = LibMetric.specificDateFilterParts(
        updatedDef,
        clause,
      );

      expect(extractedParts).not.toBeNull();
      expect(extractedParts?.operator).toBe("between");
      expect(extractedParts?.values.length).toBe(2);
    });

    it("should extract parts from greater than date filter", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const dateDimension = dimensions[0];

      const testDate = new Date("2024-06-01");
      const parts = {
        operator: ">" as const,
        dimension: dateDimension,
        values: [testDate],
        hasTime: false,
      };

      const clause = LibMetric.specificDateFilterClause(parts);
      const updatedDef = LibMetric.filter(definition, clause);
      const extractedParts = LibMetric.specificDateFilterParts(
        updatedDef,
        clause,
      );

      expect(extractedParts).not.toBeNull();
      expect(extractedParts?.operator).toBe(">");
    });

    it("should preserve hasTime flag when true", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const dateDimension = dimensions[0];

      const testDateTime = new Date("2024-01-15T14:30:00");
      const parts = {
        operator: "=" as const,
        dimension: dateDimension,
        values: [testDateTime],
        hasTime: true,
      };

      const clause = LibMetric.specificDateFilterClause(parts);
      const updatedDef = LibMetric.filter(definition, clause);
      const extractedParts = LibMetric.specificDateFilterParts(
        updatedDef,
        clause,
      );

      expect(extractedParts).not.toBeNull();
      expect(extractedParts?.hasTime).toBe(true);
    });

    it("should return null for non-date filter clause", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const stringDimension = dimensions[1];

      const clause = LibMetric.stringFilterClause({
        operator: "=" as const,
        dimension: stringDimension,
        values: ["test"],
        options: {},
      });
      const updatedDef = LibMetric.filter(definition, clause);
      const extractedParts = LibMetric.specificDateFilterParts(
        updatedDef,
        clause,
      );

      expect(extractedParts).toBeNull();
    });
  });

  describe("timeFilterParts", () => {
    it("should extract parts from greater than time filter", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const timeDimension = dimensions[DIM_IDX.TIME];

      const testTime = new Date("1970-01-01T09:00:00");
      const parts = {
        operator: ">" as const,
        dimension: timeDimension,
        values: [testTime],
      };

      const clause = LibMetric.timeFilterClause(parts);
      const updatedDef = LibMetric.filter(definition, clause);
      const extractedParts = LibMetric.timeFilterParts(updatedDef, clause);

      expect(extractedParts).not.toBeNull();
      expect(extractedParts?.operator).toBe(">");
      expect(extractedParts?.values.length).toBe(1);
    });

    it("should extract parts from between time filter", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const timeDimension = dimensions[DIM_IDX.TIME];

      const startTime = new Date("1970-01-01T09:00:00");
      const endTime = new Date("1970-01-01T17:00:00");
      const parts = {
        operator: "between" as const,
        dimension: timeDimension,
        values: [startTime, endTime],
      };

      const clause = LibMetric.timeFilterClause(parts);
      const updatedDef = LibMetric.filter(definition, clause);
      const extractedParts = LibMetric.timeFilterParts(updatedDef, clause);

      expect(extractedParts).not.toBeNull();
      expect(extractedParts?.operator).toBe("between");
      expect(extractedParts?.values.length).toBe(2);
    });

    it("should extract parts from less than time filter", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const timeDimension = dimensions[DIM_IDX.TIME];

      const testTime = new Date("1970-01-01T12:00:00");
      const parts = {
        operator: "<" as const,
        dimension: timeDimension,
        values: [testTime],
      };

      const clause = LibMetric.timeFilterClause(parts);
      const updatedDef = LibMetric.filter(definition, clause);
      const extractedParts = LibMetric.timeFilterParts(updatedDef, clause);

      expect(extractedParts).not.toBeNull();
      expect(extractedParts?.operator).toBe("<");
    });

    it("should return null for non-time filter clause", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const stringDimension = dimensions[1];

      const clause = LibMetric.stringFilterClause({
        operator: "=" as const,
        dimension: stringDimension,
        values: ["test"],
        options: {},
      });
      const updatedDef = LibMetric.filter(definition, clause);
      const extractedParts = LibMetric.timeFilterParts(updatedDef, clause);

      expect(extractedParts).toBeNull();
    });
  });

  // ============================================================================
  // filterParts Type Discrimination Tests
  // ============================================================================

  describe("filterParts type discrimination", () => {
    it("should identify string filter and return StringFilterParts", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const stringDimension = dimensions[1]; // Category - type/Text

      const clause = LibMetric.stringFilterClause({
        operator: "=" as const,
        dimension: stringDimension,
        values: ["Electronics"],
        options: {},
      });
      const updatedDef = LibMetric.filter(definition, clause);
      const parts = LibMetric.filterParts(updatedDef, clause);

      expect(parts).not.toBeNull();
      // StringFilterParts has an options property
      expect(parts).toHaveProperty("options");
      expect((parts as { operator: string }).operator).toBe("=");
    });

    it("should identify default filter and return DefaultFilterParts", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const dimension = dimensions[0];

      const clause = LibMetric.defaultFilterClause({
        operator: "is-null" as const,
        dimension: dimension,
      });
      const updatedDef = LibMetric.filter(definition, clause);
      const parts = LibMetric.filterParts(updatedDef, clause);

      expect(parts).not.toBeNull();
      expect((parts as { operator: string }).operator).toBe("is-null");
    });

    it("should identify relative date filter and return RelativeDateFilterParts", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const dateDimension = dimensions[0];

      const clause = LibMetric.relativeDateFilterClause({
        dimension: dateDimension,
        unit: "day" as const,
        value: -30,
        offsetUnit: null,
        offsetValue: null,
        options: {},
      });
      const updatedDef = LibMetric.filter(definition, clause);
      const parts = LibMetric.filterParts(updatedDef, clause);

      expect(parts).not.toBeNull();
      // RelativeDateFilterParts has unit and value properties
      expect(parts).toHaveProperty("unit");
      expect(parts).toHaveProperty("value");
      expect((parts as { unit: string }).unit).toBe("day");
      expect((parts as { value: number }).value).toBe(-30);
    });

    it("should identify number filter and return NumberFilterParts", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const numericDimension = dimensions[DIM_IDX.NUMBER];

      const clause = LibMetric.numberFilterClause({
        operator: "between" as const,
        dimension: numericDimension,
        values: [10, 100],
      });
      const updatedDef = LibMetric.filter(definition, clause);
      const parts = LibMetric.filterParts(updatedDef, clause);

      expect(parts).not.toBeNull();
      expect((parts as { operator: string }).operator).toBe("between");
      expect((parts as { values: number[] }).values).toEqual([10, 100]);
    });

    it("should identify boolean filter and return BooleanFilterParts", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const booleanDimension = dimensions[DIM_IDX.BOOLEAN];

      const clause = LibMetric.booleanFilterClause({
        operator: "=" as const,
        dimension: booleanDimension,
        values: [true],
      });
      const updatedDef = LibMetric.filter(definition, clause);
      const parts = LibMetric.filterParts(updatedDef, clause);

      expect(parts).not.toBeNull();
      expect((parts as { operator: string }).operator).toBe("=");
      expect((parts as { values: boolean[] }).values).toEqual([true]);
    });

    it("should identify coordinate filter and return CoordinateFilterParts", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const latitudeDimension = dimensions[DIM_IDX.LATITUDE];

      const clause = LibMetric.coordinateFilterClause({
        operator: "=" as const,
        dimension: latitudeDimension,
        longitudeDimension: null,
        values: [40.7128],
      });
      const updatedDef = LibMetric.filter(definition, clause);
      const parts = LibMetric.filterParts(updatedDef, clause);

      expect(parts).not.toBeNull();
      expect((parts as { operator: string }).operator).toBe("=");
      // CoordinateFilterParts has longitudeDimension property
      expect(parts).toHaveProperty("longitudeDimension");
    });

    it("should identify specific date filter and return SpecificDateFilterParts", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const dateDimension = dimensions[0];

      const clause = LibMetric.specificDateFilterClause({
        operator: "=" as const,
        dimension: dateDimension,
        values: [new Date("2024-01-15")],
        hasTime: false,
      });
      const updatedDef = LibMetric.filter(definition, clause);
      const parts = LibMetric.filterParts(updatedDef, clause);

      expect(parts).not.toBeNull();
      expect((parts as { operator: string }).operator).toBe("=");
      // SpecificDateFilterParts has hasTime property
      expect(parts).toHaveProperty("hasTime");
      expect((parts as { hasTime: boolean }).hasTime).toBe(false);
    });

    it("should identify time filter and return TimeFilterParts", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const timeDimension = dimensions[DIM_IDX.TIME];

      const clause = LibMetric.timeFilterClause({
        operator: ">" as const,
        dimension: timeDimension,
        values: [new Date("1970-01-01T09:00:00")],
      });
      const updatedDef = LibMetric.filter(definition, clause);
      const parts = LibMetric.filterParts(updatedDef, clause);

      expect(parts).not.toBeNull();
      expect((parts as { operator: string }).operator).toBe(">");
    });

    it("should identify exclude date filter and return ExcludeDateFilterParts", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const dateDimension = dimensions[0];

      const clause = LibMetric.excludeDateFilterClause({
        operator: "!=" as const,
        dimension: dateDimension,
        unit: "day-of-week" as const,
        values: [1, 7],
      });
      const updatedDef = LibMetric.filter(definition, clause);
      const parts = LibMetric.filterParts(updatedDef, clause);

      expect(parts).not.toBeNull();
      expect((parts as { operator: string }).operator).toBe("!=");
      // ExcludeDateFilterParts has unit property
      expect(parts).toHaveProperty("unit");
      expect((parts as { unit: string }).unit).toBe("day-of-week");
    });
  });

  // ============================================================================
  // Round-Trip Invariant Tests
  // ============================================================================

  describe("filter round-trip invariants", () => {
    it("string filter: parts -> clause -> parts preserves data", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const stringDimension = dimensions[1];

      const original = {
        operator: "=" as const,
        dimension: stringDimension,
        values: ["value1", "value2"],
        options: {},
      };

      const clause = LibMetric.stringFilterClause(original);
      const updatedDef = LibMetric.filter(definition, clause);
      const extracted = LibMetric.stringFilterParts(updatedDef, clause);

      expect(extracted?.operator).toBe(original.operator);
      expect(extracted?.values).toEqual(original.values);
    });

    it("default filter: parts -> clause -> parts preserves data", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const dimension = dimensions[0];

      const original = {
        operator: "not-null" as const,
        dimension: dimension,
      };

      const clause = LibMetric.defaultFilterClause(original);
      const updatedDef = LibMetric.filter(definition, clause);
      const extracted = LibMetric.defaultFilterParts(updatedDef, clause);

      expect(extracted?.operator).toBe(original.operator);
    });

    it("relative date filter: parts -> clause -> parts preserves data", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const dateDimension = dimensions[0];

      const original = {
        dimension: dateDimension,
        unit: "week" as const,
        value: -4,
        offsetUnit: null,
        offsetValue: null,
        options: {},
      };

      const clause = LibMetric.relativeDateFilterClause(original);
      const updatedDef = LibMetric.filter(definition, clause);
      const extracted = LibMetric.relativeDateFilterParts(updatedDef, clause);

      expect(extracted?.unit).toBe(original.unit);
      expect(extracted?.value).toBe(original.value);
    });

    it("exclude date filter: parts -> clause -> parts preserves data", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const dateDimension = dimensions[0];

      const original = {
        operator: "!=" as const,
        dimension: dateDimension,
        unit: "day-of-week" as const,
        values: [1, 7],
      };

      const clause = LibMetric.excludeDateFilterClause(original);
      const updatedDef = LibMetric.filter(definition, clause);
      const extracted = LibMetric.excludeDateFilterParts(updatedDef, clause);

      expect(extracted?.operator).toBe(original.operator);
      expect(extracted?.unit).toBe(original.unit);
      expect(extracted?.values).toEqual(original.values);
    });

    it("number filter: parts -> clause -> parts preserves data", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const numericDimension = dimensions[DIM_IDX.NUMBER];

      const original = {
        operator: "between" as const,
        dimension: numericDimension,
        values: [10, 100],
      };

      const clause = LibMetric.numberFilterClause(original);
      const updatedDef = LibMetric.filter(definition, clause);
      const extracted = LibMetric.numberFilterParts(updatedDef, clause);

      expect(extracted?.operator).toBe(original.operator);
      expect(extracted?.values).toEqual(original.values);
    });

    it("boolean filter: parts -> clause -> parts preserves data", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const booleanDimension = dimensions[DIM_IDX.BOOLEAN];

      const original = {
        operator: "=" as const,
        dimension: booleanDimension,
        values: [true],
      };

      const clause = LibMetric.booleanFilterClause(original);
      const updatedDef = LibMetric.filter(definition, clause);
      const extracted = LibMetric.booleanFilterParts(updatedDef, clause);

      expect(extracted?.operator).toBe(original.operator);
      expect(extracted?.values).toEqual(original.values);
    });

    it("coordinate filter: parts -> clause -> parts preserves data", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const latitudeDimension = dimensions[DIM_IDX.LATITUDE];

      const original = {
        operator: "=" as const,
        dimension: latitudeDimension,
        longitudeDimension: null,
        values: [40.7128],
      };

      const clause = LibMetric.coordinateFilterClause(original);
      const updatedDef = LibMetric.filter(definition, clause);
      const extracted = LibMetric.coordinateFilterParts(updatedDef, clause);

      expect(extracted?.operator).toBe(original.operator);
      expect(extracted?.values).toEqual(original.values);
    });

    it("time filter: parts -> clause -> parts preserves data", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const timeDimension = dimensions[DIM_IDX.TIME];

      const startTime = new Date("1970-01-01T09:00:00");
      const endTime = new Date("1970-01-01T17:00:00");
      const original = {
        operator: "between" as const,
        dimension: timeDimension,
        values: [startTime, endTime],
      };

      const clause = LibMetric.timeFilterClause(original);
      const updatedDef = LibMetric.filter(definition, clause);
      const extracted = LibMetric.timeFilterParts(updatedDef, clause);

      expect(extracted?.operator).toBe(original.operator);
      expect(extracted?.values.length).toBe(original.values.length);
    });
  });

  // ============================================================================
  // Filter Position Tracking Tests
  // ============================================================================

  describe("filter position tracking", () => {
    it("should track filter positions after adding filters", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const stringDimension = dimensions[1];

      // Add a filter on the string dimension
      const clause = LibMetric.stringFilterClause({
        operator: "=" as const,
        dimension: stringDimension,
        values: ["Electronics"],
        options: {},
      });
      const updatedDef = LibMetric.filter(definition, clause);

      // Get dimensions from the updated definition
      const updatedDimensions = LibMetric.filterableDimensions(updatedDef);
      const updatedStringDim = updatedDimensions[1];

      const info = LibMetric.displayInfo(updatedDef, updatedStringDim);
      // The string dimension should now have a filter at position 0
      expect(info.filterPositions).toEqual([0]);
    });

    it("should track multiple filter positions on same dimension", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const stringDimension = dimensions[1];

      // Add two filters on the same dimension
      const clause1 = LibMetric.stringFilterClause({
        operator: "!=" as const,
        dimension: stringDimension,
        values: ["Excluded"],
        options: {},
      });
      let updatedDef = LibMetric.filter(definition, clause1);

      const clause2 = LibMetric.stringFilterClause({
        operator: "contains" as const,
        dimension: stringDimension,
        values: ["search"],
        options: {},
      });
      updatedDef = LibMetric.filter(updatedDef, clause2);

      const updatedDimensions = LibMetric.filterableDimensions(updatedDef);
      const updatedStringDim = updatedDimensions[1];

      const info = LibMetric.displayInfo(updatedDef, updatedStringDim);
      expect(info.filterPositions).toEqual([0, 1]);
    });

    it("should not affect other dimensions filter positions", () => {
      const { definition } = setupDefinition();
      const dimensions = LibMetric.filterableDimensions(definition);
      const stringDimension = dimensions[1];

      // Add a filter only on the string dimension
      const clause = LibMetric.stringFilterClause({
        operator: "=" as const,
        dimension: stringDimension,
        values: ["Electronics"],
        options: {},
      });
      const updatedDef = LibMetric.filter(definition, clause);

      const updatedDimensions = LibMetric.filterableDimensions(updatedDef);
      const updatedDateDim = updatedDimensions[0];

      const info = LibMetric.displayInfo(updatedDef, updatedDateDim);
      // The date dimension should have no filters
      expect(info.filterPositions).toEqual([]);
    });
  });
});
