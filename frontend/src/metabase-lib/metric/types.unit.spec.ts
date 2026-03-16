import Metadata from "metabase-lib/v1/metadata/Metadata";
import Metric from "metabase-lib/v1/metadata/Metric";
import {
  createMockMetric,
  createMockMetricDimension,
} from "metabase-types/api/mocks/metric";

import * as LibMetric from "./core";
import type {
  DimensionMetadata,
  MetadataProvider,
  MetricDefinition,
} from "./types";

/**
 * Creates test metrics with dimensions of specific types for testing type predicates.
 */
function createTestMetadata(): Metadata {
  const metadata = new Metadata();

  // Create a metric with various dimension types
  const testMetric = createMockMetric({
    id: 1,
    name: "Test Metric",
    dimensions: [
      createMockMetricDimension({
        id: "dim-boolean",
        display_name: "Is Active",
        effective_type: "type/Boolean",
        semantic_type: null,
      }),
      createMockMetricDimension({
        id: "dim-integer",
        display_name: "Count",
        effective_type: "type/Integer",
        semantic_type: null,
      }),
      createMockMetricDimension({
        id: "dim-float",
        display_name: "Amount",
        effective_type: "type/Float",
        semantic_type: null,
      }),
      createMockMetricDimension({
        id: "dim-string",
        display_name: "Name",
        effective_type: "type/Text",
        semantic_type: null,
      }),
      createMockMetricDimension({
        id: "dim-datetime",
        display_name: "Created At",
        effective_type: "type/DateTime",
        semantic_type: null,
      }),
      createMockMetricDimension({
        id: "dim-date",
        display_name: "Birth Date",
        effective_type: "type/Date",
        semantic_type: null,
      }),
      createMockMetricDimension({
        id: "dim-time",
        display_name: "Start Time",
        effective_type: "type/Time",
        semantic_type: null,
      }),
      // Semantic type based dimensions
      createMockMetricDimension({
        id: "dim-coordinate",
        display_name: "Location Coord",
        effective_type: "type/Float",
        semantic_type: "type/Coordinate",
      }),
      createMockMetricDimension({
        id: "dim-latitude",
        display_name: "Latitude",
        effective_type: "type/Float",
        semantic_type: "type/Latitude",
      }),
      createMockMetricDimension({
        id: "dim-longitude",
        display_name: "Longitude",
        effective_type: "type/Float",
        semantic_type: "type/Longitude",
      }),
      createMockMetricDimension({
        id: "dim-address",
        display_name: "Address",
        effective_type: "type/Text",
        semantic_type: "type/Address",
      }),
      createMockMetricDimension({
        id: "dim-fk",
        display_name: "User ID",
        effective_type: "type/Integer",
        semantic_type: "type/FK",
      }),
      createMockMetricDimension({
        id: "dim-pk",
        display_name: "ID",
        effective_type: "type/Integer",
        semantic_type: "type/PK",
      }),
    ],
  });

  const metricInstance = new Metric(testMetric as any);
  metricInstance.metadata = metadata;
  metadata.metrics = {
    [testMetric.id]: metricInstance,
  };

  return metadata;
}

function setupDefinition(): {
  provider: MetadataProvider;
  definition: MetricDefinition;
  dimensions: DimensionMetadata[];
} {
  const metadata = createTestMetadata();
  const provider = LibMetric.metadataProvider(metadata);
  const metricMeta = LibMetric.metricMetadata(provider, 1);
  expect(metricMeta).not.toBeNull();
  const definition = LibMetric.fromMetricMetadata(provider, metricMeta!);
  const dimensions = LibMetric.filterableDimensions(definition);
  return { provider, definition, dimensions };
}

describe("metabase-lib/metric/types", () => {
  describe("effective-type predicates", () => {
    describe("isBoolean", () => {
      it("returns true for boolean dimensions", () => {
        const { dimensions } = setupDefinition();
        const boolDim = dimensions.find((d) => LibMetric.isBoolean(d));
        expect(boolDim).toBeDefined();
        expect(LibMetric.isBoolean(boolDim!)).toBe(true);
      });

      it("returns false for non-boolean dimensions", () => {
        const { dimensions } = setupDefinition();
        const nonBoolDims = dimensions.filter((d) => !LibMetric.isBoolean(d));
        expect(nonBoolDims.length).toBeGreaterThan(0);
        nonBoolDims.forEach((d) => {
          expect(LibMetric.isBoolean(d)).toBe(false);
        });
      });
    });

    describe("isNumeric", () => {
      it("returns true for numeric dimensions", () => {
        const { dimensions } = setupDefinition();
        const numericDims = dimensions.filter((d) => LibMetric.isNumeric(d));
        // Should have integer, float, and all coordinate-based dimensions (which are floats)
        // Also FK/PK are integers
        expect(numericDims.length).toBeGreaterThan(0);
      });

      it("returns false for string dimensions", () => {
        const { dimensions } = setupDefinition();
        // Find a pure string dimension (no semantic type like Address)
        const stringDim = dimensions.find(
          (d) => LibMetric.isStringOrStringLike(d) && !LibMetric.isLocation(d),
        );
        expect(stringDim).toBeDefined();
        expect(LibMetric.isNumeric(stringDim!)).toBe(false);
      });
    });

    describe("isTemporal", () => {
      it("returns true for temporal dimensions (datetime, date, time)", () => {
        const { dimensions } = setupDefinition();
        const temporalDims = dimensions.filter((d) => LibMetric.isTemporal(d));
        // Should have datetime, date, and time dimensions
        expect(temporalDims.length).toBe(3);
      });

      it("returns false for non-temporal dimensions", () => {
        const { dimensions } = setupDefinition();
        const boolDim = dimensions.find((d) => LibMetric.isBoolean(d));
        expect(boolDim).toBeDefined();
        expect(LibMetric.isTemporal(boolDim!)).toBe(false);
      });
    });

    describe("isTime", () => {
      it("returns true for time-only dimensions", () => {
        const { dimensions } = setupDefinition();
        const timeDims = dimensions.filter((d) => LibMetric.isTime(d));
        expect(timeDims.length).toBe(1);
      });

      it("returns false for date/datetime dimensions", () => {
        const { dimensions } = setupDefinition();
        const temporalNonTime = dimensions.filter(
          (d) => LibMetric.isTemporal(d) && !LibMetric.isTime(d),
        );
        expect(temporalNonTime.length).toBe(2); // datetime and date
        temporalNonTime.forEach((d) => {
          expect(LibMetric.isTime(d)).toBe(false);
        });
      });
    });

    describe("isDateOrDateTime", () => {
      it("returns true for date and datetime dimensions", () => {
        const { dimensions } = setupDefinition();
        const dateOrDatetimeDims = dimensions.filter((d) =>
          LibMetric.isDateOrDateTime(d),
        );
        // Should have datetime and date (but not time)
        expect(dateOrDatetimeDims.length).toBe(2);
      });

      it("returns false for time-only dimensions", () => {
        const { dimensions } = setupDefinition();
        const timeDim = dimensions.find((d) => LibMetric.isTime(d));
        expect(timeDim).toBeDefined();
        expect(LibMetric.isDateOrDateTime(timeDim!)).toBe(false);
      });
    });

    describe("isStringOrStringLike", () => {
      it("returns true for string dimensions", () => {
        const { dimensions } = setupDefinition();
        const stringDims = dimensions.filter((d) =>
          LibMetric.isStringOrStringLike(d),
        );
        // Should have Name and Address dimensions
        expect(stringDims.length).toBeGreaterThan(0);
      });
    });
  });

  describe("semantic-type predicates", () => {
    describe("isCoordinate", () => {
      it("returns true for coordinate dimensions", () => {
        const { dimensions } = setupDefinition();
        const coordDims = dimensions.filter((d) => LibMetric.isCoordinate(d));
        // Should have coordinate, latitude, and longitude
        expect(coordDims.length).toBe(3);
      });

      it("latitude and longitude are also coordinates", () => {
        const { dimensions } = setupDefinition();
        const latDims = dimensions.filter((d) => LibMetric.isLatitude(d));
        const lonDims = dimensions.filter((d) => LibMetric.isLongitude(d));

        latDims.forEach((d) => expect(LibMetric.isCoordinate(d)).toBe(true));
        lonDims.forEach((d) => expect(LibMetric.isCoordinate(d)).toBe(true));
      });
    });

    describe("isLatitude", () => {
      it("returns true only for latitude dimensions", () => {
        const { dimensions } = setupDefinition();
        const latDims = dimensions.filter((d) => LibMetric.isLatitude(d));
        expect(latDims.length).toBe(1);
      });
    });

    describe("isLongitude", () => {
      it("returns true only for longitude dimensions", () => {
        const { dimensions } = setupDefinition();
        const lonDims = dimensions.filter((d) => LibMetric.isLongitude(d));
        expect(lonDims.length).toBe(1);
      });
    });

    describe("isLocation", () => {
      it("returns true for address/location dimensions", () => {
        const { dimensions } = setupDefinition();
        const locationDims = dimensions.filter((d) => LibMetric.isLocation(d));
        expect(locationDims.length).toBe(1);
      });
    });

    describe("isForeignKey", () => {
      it("returns true for FK dimensions", () => {
        const { dimensions } = setupDefinition();
        const fkDims = dimensions.filter((d) => LibMetric.isForeignKey(d));
        expect(fkDims.length).toBe(1);
      });

      it("returns false for PK dimensions", () => {
        const { dimensions } = setupDefinition();
        const pkDims = dimensions.filter((d) => LibMetric.isPrimaryKey(d));
        pkDims.forEach((d) => expect(LibMetric.isForeignKey(d)).toBe(false));
      });
    });

    describe("isPrimaryKey", () => {
      it("returns true for PK dimensions", () => {
        const { dimensions } = setupDefinition();
        const pkDims = dimensions.filter((d) => LibMetric.isPrimaryKey(d));
        expect(pkDims.length).toBe(1);
      });

      it("returns false for FK dimensions", () => {
        const { dimensions } = setupDefinition();
        const fkDims = dimensions.filter((d) => LibMetric.isForeignKey(d));
        fkDims.forEach((d) => expect(LibMetric.isPrimaryKey(d)).toBe(false));
      });
    });
  });

  describe("type predicates return boolean", () => {
    it("all predicates return boolean type", () => {
      const { dimensions } = setupDefinition();
      expect(dimensions.length).toBeGreaterThan(0);
      const dim = dimensions[0];

      expect(typeof LibMetric.isBoolean(dim)).toBe("boolean");
      expect(typeof LibMetric.isNumeric(dim)).toBe("boolean");
      expect(typeof LibMetric.isTemporal(dim)).toBe("boolean");
      expect(typeof LibMetric.isTime(dim)).toBe("boolean");
      expect(typeof LibMetric.isDateOrDateTime(dim)).toBe("boolean");
      expect(typeof LibMetric.isStringLike(dim)).toBe("boolean");
      expect(typeof LibMetric.isStringOrStringLike(dim)).toBe("boolean");
      expect(typeof LibMetric.isCoordinate(dim)).toBe("boolean");
      expect(typeof LibMetric.isLatitude(dim)).toBe("boolean");
      expect(typeof LibMetric.isLongitude(dim)).toBe("boolean");
      expect(typeof LibMetric.isLocation(dim)).toBe("boolean");
      expect(typeof LibMetric.isForeignKey(dim)).toBe("boolean");
      expect(typeof LibMetric.isPrimaryKey(dim)).toBe("boolean");
    });
  });
});
