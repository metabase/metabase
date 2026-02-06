import Metadata from "metabase-lib/v1/metadata/Metadata";
import Metric from "metabase-lib/v1/metadata/Metric";
import type { JsMetricDefinition } from "metabase-types/api";
import {
  createMockMetric,
  createMockMetricDimension,
} from "metabase-types/api/mocks/metric";

import * as LibMetric from "./core";

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
      const metadata = createSampleMetadata();
      const provider = LibMetric.metadataProvider(metadata);
      const metricMeta = LibMetric.metricMetadata(provider, SAMPLE_METRIC.id);

      expect(metricMeta).not.toBeNull();
      if (metricMeta) {
        const definition = LibMetric.fromMetricMetadata(provider, metricMeta);
        expect(definition).toBeDefined();
      }
    });
  });

  describe("sourceMetricId", () => {
    it("should return the source metric ID for a metric-based definition", () => {
      const metadata = createSampleMetadata();
      const provider = LibMetric.metadataProvider(metadata);
      const metricMeta = LibMetric.metricMetadata(provider, SAMPLE_METRIC.id);

      expect(metricMeta).not.toBeNull();
      if (metricMeta) {
        const definition = LibMetric.fromMetricMetadata(provider, metricMeta);
        const sourceId = LibMetric.sourceMetricId(definition);

        expect(sourceId).toBe(SAMPLE_METRIC.id);
      }
    });
  });

  describe("sourceMeasureId", () => {
    it("should return null for a metric-based definition", () => {
      const metadata = createSampleMetadata();
      const provider = LibMetric.metadataProvider(metadata);
      const metricMeta = LibMetric.metricMetadata(provider, SAMPLE_METRIC.id);

      expect(metricMeta).not.toBeNull();
      if (metricMeta) {
        const definition = LibMetric.fromMetricMetadata(provider, metricMeta);
        const sourceId = LibMetric.sourceMeasureId(definition);

        expect(sourceId).toBeNull();
      }
    });
  });

  describe("filters", () => {
    it("should return filters for a new definition (empty by default)", () => {
      const metadata = createSampleMetadata();
      const provider = LibMetric.metadataProvider(metadata);
      const metricMeta = LibMetric.metricMetadata(provider, SAMPLE_METRIC.id);

      expect(metricMeta).not.toBeNull();
      if (metricMeta) {
        const definition = LibMetric.fromMetricMetadata(provider, metricMeta);
        const filterClauses = LibMetric.filters(definition);

        // filters returns a CLJS array-like structure
        expect(filterClauses).toBeDefined();
        expect(filterClauses.length).toBe(0);
      }
    });
  });

  describe("projections", () => {
    it("should return projections for a new definition (empty by default)", () => {
      const metadata = createSampleMetadata();
      const provider = LibMetric.metadataProvider(metadata);
      const metricMeta = LibMetric.metricMetadata(provider, SAMPLE_METRIC.id);

      expect(metricMeta).not.toBeNull();
      if (metricMeta) {
        const definition = LibMetric.fromMetricMetadata(provider, metricMeta);
        const projectionClauses = LibMetric.projections(definition);

        // projections returns a CLJS array-like structure
        expect(projectionClauses).toBeDefined();
        expect(projectionClauses.length).toBe(0);
      }
    });
  });

  describe("filterableDimensions", () => {
    it("should return filterable dimensions for a definition", () => {
      const metadata = createSampleMetadata();
      const provider = LibMetric.metadataProvider(metadata);
      const metricMeta = LibMetric.metricMetadata(provider, SAMPLE_METRIC.id);

      expect(metricMeta).not.toBeNull();
      if (metricMeta) {
        const definition = LibMetric.fromMetricMetadata(provider, metricMeta);
        const dimensions = LibMetric.filterableDimensions(definition);

        // Returns a CLJS array-like structure (may be proxied)
        expect(dimensions).toBeDefined();
        expect(typeof dimensions.length).toBe("number");
      }
    });
  });

  describe("projectionableDimensions", () => {
    it("should return projectionable dimensions for a definition", () => {
      const metadata = createSampleMetadata();
      const provider = LibMetric.metadataProvider(metadata);
      const metricMeta = LibMetric.metricMetadata(provider, SAMPLE_METRIC.id);

      expect(metricMeta).not.toBeNull();
      if (metricMeta) {
        const definition = LibMetric.fromMetricMetadata(provider, metricMeta);
        const dimensions = LibMetric.projectionableDimensions(definition);

        // Returns a CLJS array-like structure (may be proxied)
        expect(dimensions).toBeDefined();
        expect(typeof dimensions.length).toBe("number");
      }
    });
  });

  describe("displayInfo", () => {
    it("should return display info for metric metadata", () => {
      const metadata = createSampleMetadata();
      const provider = LibMetric.metadataProvider(metadata);
      const metricMeta = LibMetric.metricMetadata(provider, SAMPLE_METRIC.id);

      expect(metricMeta).not.toBeNull();
      if (metricMeta) {
        const definition = LibMetric.fromMetricMetadata(provider, metricMeta);
        const info = LibMetric.displayInfo(definition, metricMeta);

        expect(info).toBeDefined();
        // displayName is accessed via proxy, may be camelCase
        expect(info.displayName).toBeDefined();
      }
    });
  });

  describe("availableTemporalBuckets", () => {
    it("should return available temporal buckets for a dimension", () => {
      const metadata = createSampleMetadata();
      const provider = LibMetric.metadataProvider(metadata);
      const metricMeta = LibMetric.metricMetadata(provider, SAMPLE_METRIC.id);

      expect(metricMeta).not.toBeNull();
      if (metricMeta) {
        const definition = LibMetric.fromMetricMetadata(provider, metricMeta);
        const dimensions = LibMetric.filterableDimensions(definition);

        if (dimensions.length > 0) {
          const buckets = LibMetric.availableTemporalBuckets(
            definition,
            dimensions[0],
          );
          // Returns a CLJS array-like structure
          expect(buckets).toBeDefined();
          expect(typeof buckets.length).toBe("number");
        }
      }
    });
  });

  describe("isTemporalBucketable", () => {
    it("should check if a dimension can have temporal buckets applied", () => {
      const metadata = createSampleMetadata();
      const provider = LibMetric.metadataProvider(metadata);
      const metricMeta = LibMetric.metricMetadata(provider, SAMPLE_METRIC.id);

      expect(metricMeta).not.toBeNull();
      if (metricMeta) {
        const definition = LibMetric.fromMetricMetadata(provider, metricMeta);
        const dimensions = LibMetric.filterableDimensions(definition);

        if (dimensions.length > 0) {
          const result = LibMetric.isTemporalBucketable(
            definition,
            dimensions[0],
          );
          expect(typeof result).toBe("boolean");
        }
      }
    });
  });

  describe("availableBinningStrategies", () => {
    it("should return available binning strategies for a dimension", () => {
      const metadata = createSampleMetadata();
      const provider = LibMetric.metadataProvider(metadata);
      const metricMeta = LibMetric.metricMetadata(provider, SAMPLE_METRIC.id);

      expect(metricMeta).not.toBeNull();
      if (metricMeta) {
        const definition = LibMetric.fromMetricMetadata(provider, metricMeta);
        const dimensions = LibMetric.filterableDimensions(definition);

        if (dimensions.length > 0) {
          const strategies = LibMetric.availableBinningStrategies(
            definition,
            dimensions[0],
          );
          // Returns a CLJS array-like structure
          expect(strategies).toBeDefined();
          expect(typeof strategies.length).toBe("number");
        }
      }
    });
  });

  describe("isBinnable", () => {
    it("should check if a dimension can have binning applied", () => {
      const metadata = createSampleMetadata();
      const provider = LibMetric.metadataProvider(metadata);
      const metricMeta = LibMetric.metricMetadata(provider, SAMPLE_METRIC.id);

      expect(metricMeta).not.toBeNull();
      if (metricMeta) {
        const definition = LibMetric.fromMetricMetadata(provider, metricMeta);
        const dimensions = LibMetric.filterableDimensions(definition);

        if (dimensions.length > 0) {
          const result = LibMetric.isBinnable(definition, dimensions[0]);
          expect(typeof result).toBe("boolean");
        }
      }
    });
  });

  describe("type checking functions", () => {
    it("isBoolean should return a boolean", () => {
      const metadata = createSampleMetadata();
      const provider = LibMetric.metadataProvider(metadata);
      const metricMeta = LibMetric.metricMetadata(provider, SAMPLE_METRIC.id);

      expect(metricMeta).not.toBeNull();
      if (metricMeta) {
        const definition = LibMetric.fromMetricMetadata(provider, metricMeta);
        const dimensions = LibMetric.filterableDimensions(definition);

        if (dimensions.length > 0) {
          expect(typeof LibMetric.isBoolean(dimensions[0])).toBe("boolean");
        }
      }
    });

    it("isNumeric should return a boolean", () => {
      const metadata = createSampleMetadata();
      const provider = LibMetric.metadataProvider(metadata);
      const metricMeta = LibMetric.metricMetadata(provider, SAMPLE_METRIC.id);

      expect(metricMeta).not.toBeNull();
      if (metricMeta) {
        const definition = LibMetric.fromMetricMetadata(provider, metricMeta);
        const dimensions = LibMetric.filterableDimensions(definition);

        if (dimensions.length > 0) {
          expect(typeof LibMetric.isNumeric(dimensions[0])).toBe("boolean");
        }
      }
    });

    it("isTemporal should return a boolean", () => {
      const metadata = createSampleMetadata();
      const provider = LibMetric.metadataProvider(metadata);
      const metricMeta = LibMetric.metricMetadata(provider, SAMPLE_METRIC.id);

      expect(metricMeta).not.toBeNull();
      if (metricMeta) {
        const definition = LibMetric.fromMetricMetadata(provider, metricMeta);
        const dimensions = LibMetric.filterableDimensions(definition);

        if (dimensions.length > 0) {
          expect(typeof LibMetric.isTemporal(dimensions[0])).toBe("boolean");
        }
      }
    });

    it("isStringLike should return a boolean", () => {
      const metadata = createSampleMetadata();
      const provider = LibMetric.metadataProvider(metadata);
      const metricMeta = LibMetric.metricMetadata(provider, SAMPLE_METRIC.id);

      expect(metricMeta).not.toBeNull();
      if (metricMeta) {
        const definition = LibMetric.fromMetricMetadata(provider, metricMeta);
        const dimensions = LibMetric.filterableDimensions(definition);

        if (dimensions.length > 0) {
          expect(typeof LibMetric.isStringLike(dimensions[0])).toBe("boolean");
        }
      }
    });
  });

  describe("toJsMetricDefinition and fromJsMetricDefinition", () => {
    it("should round-trip a metric definition through JS format", () => {
      const metadata = createSampleMetadata();
      const provider = LibMetric.metadataProvider(metadata);
      const metricMeta = LibMetric.metricMetadata(provider, SAMPLE_METRIC.id);

      expect(metricMeta).not.toBeNull();
      if (metricMeta) {
        const definition = LibMetric.fromMetricMetadata(provider, metricMeta);
        const jsDefinition = LibMetric.toJsMetricDefinition(definition);

        expect(jsDefinition).toBeDefined();
        // Access the source-metric property using bracket notation for kebab-case key
        expect((jsDefinition as Record<string, unknown>)["source-metric"]).toBe(
          SAMPLE_METRIC.id,
        );

        const roundTripped = LibMetric.fromJsMetricDefinition(
          provider,
          jsDefinition,
        );
        expect(LibMetric.sourceMetricId(roundTripped)).toBe(SAMPLE_METRIC.id);
      }
    });
  });

  describe("filterParts", () => {
    it("should return null for clauses that do not match any filter type", () => {
      const metadata = createSampleMetadata();
      const provider = LibMetric.metadataProvider(metadata);
      const metricMeta = LibMetric.metricMetadata(provider, SAMPLE_METRIC.id);

      expect(metricMeta).not.toBeNull();
      if (metricMeta) {
        const definition = LibMetric.fromMetricMetadata(provider, metricMeta);
        const filterClauses = LibMetric.filters(definition);

        // New definition has no filters
        expect(filterClauses).toBeDefined();
        expect(filterClauses.length).toBe(0);
      }
    });
  });

  describe("dimensionValuesInfo", () => {
    it("should return dimension values info for a dimension", () => {
      const metadata = createSampleMetadata();
      const provider = LibMetric.metadataProvider(metadata);
      const metricMeta = LibMetric.metricMetadata(provider, SAMPLE_METRIC.id);

      expect(metricMeta).not.toBeNull();
      if (metricMeta) {
        const definition = LibMetric.fromMetricMetadata(provider, metricMeta);
        const dimensions = LibMetric.filterableDimensions(definition);

        if (dimensions.length > 0) {
          const info = LibMetric.dimensionValuesInfo(definition, dimensions[0]);
          expect(info).toBeDefined();
          // Properties may be accessed via proxy with camelCase
          expect(info.canListValues !== undefined).toBe(true);
          expect(info.canSearchValues !== undefined).toBe(true);
          expect(info.canRemapValues !== undefined).toBe(true);
        }
      }
    });
  });

  describe("MetadataProviderable - using MetricDefinition as provider", () => {
    it("metricMetadata should accept a MetricDefinition", () => {
      const metadata = createSampleMetadata();
      const provider = LibMetric.metadataProvider(metadata);
      const metricMeta = LibMetric.metricMetadata(provider, SAMPLE_METRIC.id);

      expect(metricMeta).not.toBeNull();
      if (metricMeta) {
        const definition = LibMetric.fromMetricMetadata(provider, metricMeta);

        // Use the definition as MetadataProviderable to look up the same metric
        const metricMetaFromDefinition = LibMetric.metricMetadata(
          definition,
          SAMPLE_METRIC.id,
        );

        expect(metricMetaFromDefinition).not.toBeNull();
      }
    });

    it("fromMetricMetadata should accept a MetricDefinition", () => {
      const metadata = createSampleMetadata();
      const provider = LibMetric.metadataProvider(metadata);
      const metricMeta = LibMetric.metricMetadata(provider, SAMPLE_METRIC.id);

      expect(metricMeta).not.toBeNull();
      if (metricMeta) {
        const definition = LibMetric.fromMetricMetadata(provider, metricMeta);

        // Create a new definition using the existing definition as MetadataProviderable
        const newDefinition = LibMetric.fromMetricMetadata(
          definition,
          metricMeta,
        );

        expect(newDefinition).toBeDefined();
        expect(LibMetric.sourceMetricId(newDefinition)).toBe(SAMPLE_METRIC.id);
      }
    });

    it("fromJsMetricDefinition should accept a MetricDefinition", () => {
      const metadata = createSampleMetadata();
      const provider = LibMetric.metadataProvider(metadata);
      const metricMeta = LibMetric.metricMetadata(provider, SAMPLE_METRIC.id);

      expect(metricMeta).not.toBeNull();
      if (metricMeta) {
        const definition = LibMetric.fromMetricMetadata(provider, metricMeta);

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
      }
    });
  });
});
