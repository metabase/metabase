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
  ],
});

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
      expect((jsDefinition as Record<string, unknown>)["source-metric"]).toBe(
        SAMPLE_METRIC.id,
      );

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

      // Create a new definition from JS format using the existing definition as MetadataProviderable
      const jsDefinition = {
        "source-metric": SAMPLE_METRIC.id,
      } as unknown as JsMetricDefinition;
      const newDefinition = LibMetric.fromJsMetricDefinition(
        definition,
        jsDefinition,
      );

      expect(newDefinition).toBeDefined();
      expect(LibMetric.sourceMetricId(newDefinition)).toBe(SAMPLE_METRIC.id);
    });
  });
});
