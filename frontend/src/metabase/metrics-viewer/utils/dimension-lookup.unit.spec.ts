import * as LibMetric from "metabase-lib/metric";

import {
  REVENUE_METRIC,
  TOTAL_MEASURE,
  createMetricMetadata,
  measureMetadata,
  setupDefinition,
  setupMeasureDefinition,
} from "./__tests__/test-helpers";
import {
  findBinningStrategy,
  findDimensionById,
  findFilterDimensionById,
  findTemporalBucket,
} from "./dimension-lookup";

const metricMeta = createMetricMetadata([REVENUE_METRIC]);

describe("findDimensionById", () => {
  describe("metric", () => {
    it("finds projectionable dimension by ID", () => {
      const definition = setupDefinition(metricMeta, REVENUE_METRIC.id);
      const dimension = findDimensionById(definition, "dim-created-at");
      expect(LibMetric.displayInfo(definition, dimension!).displayName).toBe(
        "Created At",
      );
    });

    it("returns undefined for unknown dimension ID", () => {
      const definition = setupDefinition(metricMeta, REVENUE_METRIC.id);
      expect(findDimensionById(definition, "nonexistent")).toBeUndefined();
    });
  });

  describe("measure", () => {
    it("finds projectionable dimension by ID", () => {
      const definition = setupMeasureDefinition(
        measureMetadata,
        TOTAL_MEASURE.id,
      );
      const dimension = findDimensionById(definition, "measure-dim-created-at");
      expect(LibMetric.displayInfo(definition, dimension!).displayName).toBe(
        "Created At",
      );
    });

    it("returns undefined for unknown dimension ID", () => {
      const definition = setupMeasureDefinition(
        measureMetadata,
        TOTAL_MEASURE.id,
      );
      expect(findDimensionById(definition, "nonexistent")).toBeUndefined();
    });
  });
});

describe("findFilterDimensionById", () => {
  describe("metric", () => {
    it("finds filterable dimension by ID", () => {
      const definition = setupDefinition(metricMeta, REVENUE_METRIC.id);
      const dimension = findFilterDimensionById(definition, "dim-created-at");
      expect(LibMetric.displayInfo(definition, dimension!).displayName).toBe(
        "Created At",
      );
    });

    it("returns undefined for unknown dimension ID", () => {
      const definition = setupDefinition(metricMeta, REVENUE_METRIC.id);
      expect(
        findFilterDimensionById(definition, "nonexistent"),
      ).toBeUndefined();
    });
  });

  describe("measure", () => {
    it("finds filterable dimension by ID", () => {
      const definition = setupMeasureDefinition(
        measureMetadata,
        TOTAL_MEASURE.id,
      );
      const dimension = findFilterDimensionById(
        definition,
        "measure-dim-created-at",
      );
      expect(LibMetric.displayInfo(definition, dimension!).displayName).toBe(
        "Created At",
      );
    });
  });
});

describe("findTemporalBucket", () => {
  describe("metric", () => {
    it("finds temporal bucket by unit for DateTime dimension", () => {
      const definition = setupDefinition(metricMeta, REVENUE_METRIC.id);
      const dimension = findDimensionById(definition, "dim-created-at")!;
      const bucket = findTemporalBucket(definition, dimension, "month");
      expect(LibMetric.displayInfo(definition, bucket!).shortName).toBe(
        "month",
      );
    });

    it("returns null for non-temporal dimension", () => {
      const definition = setupDefinition(metricMeta, REVENUE_METRIC.id);
      const dimension = findDimensionById(definition, "dim-category")!;
      expect(findTemporalBucket(definition, dimension, "month")).toBeNull();
    });
  });

  describe("measure", () => {
    it("finds temporal bucket by unit for DateTime dimension", () => {
      const definition = setupMeasureDefinition(
        measureMetadata,
        TOTAL_MEASURE.id,
      );
      const dimension = findDimensionById(
        definition,
        "measure-dim-created-at",
      )!;
      const bucket = findTemporalBucket(definition, dimension, "month");
      expect(LibMetric.displayInfo(definition, bucket!).shortName).toBe(
        "month",
      );
    });

    it("returns null for non-temporal dimension", () => {
      const definition = setupMeasureDefinition(
        measureMetadata,
        TOTAL_MEASURE.id,
      );
      const dimension = findDimensionById(definition, "measure-dim-quantity")!;
      expect(findTemporalBucket(definition, dimension, "month")).toBeNull();
    });
  });
});

describe("findBinningStrategy", () => {
  describe("metric", () => {
    it("finds binning strategy by display name for numeric dimension", () => {
      const definition = setupDefinition(metricMeta, REVENUE_METRIC.id);
      const dimension = findDimensionById(definition, "dim-amount")!;
      const strategies = LibMetric.availableBinningStrategies(
        definition,
        dimension,
      );
      const targetName = LibMetric.displayInfo(
        definition,
        strategies[0],
      ).displayName;

      const result = findBinningStrategy(definition, dimension, targetName);
      expect(LibMetric.displayInfo(definition, result!).displayName).toBe(
        targetName,
      );
    });

    it("returns null for non-binnable dimension", () => {
      const definition = setupDefinition(metricMeta, REVENUE_METRIC.id);
      const dimension = findDimensionById(definition, "dim-category")!;
      expect(findBinningStrategy(definition, dimension, "10 bins")).toBeNull();
    });
  });

  describe("measure", () => {
    it("finds binning strategy by display name for numeric dimension", () => {
      const definition = setupMeasureDefinition(
        measureMetadata,
        TOTAL_MEASURE.id,
      );
      const dimension = findDimensionById(definition, "measure-dim-total")!;
      const strategies = LibMetric.availableBinningStrategies(
        definition,
        dimension,
      );
      const targetName = LibMetric.displayInfo(
        definition,
        strategies[0],
      ).displayName;

      const result = findBinningStrategy(definition, dimension, targetName);
      expect(LibMetric.displayInfo(definition, result!).displayName).toBe(
        targetName,
      );
    });

    it("returns null for non-binnable dimension", () => {
      const definition = setupMeasureDefinition(
        measureMetadata,
        TOTAL_MEASURE.id,
      );
      const dimension = findDimensionById(definition, "measure-dim-quantity")!;
      expect(findBinningStrategy(definition, dimension, "10 bins")).toBeNull();
    });
  });
});
