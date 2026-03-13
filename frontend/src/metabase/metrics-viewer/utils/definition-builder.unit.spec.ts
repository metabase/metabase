import * as LibMetric from "metabase-lib/metric";

import {
  REVENUE_METRIC,
  TOTAL_MEASURE,
  createMetricMetadata,
  measureMetadata,
  setupDefinition,
  setupDefinitionWithBreakout,
  setupMeasureDefinition,
  setupMeasureDefinitionWithBreakout,
} from "./__tests__/test-helpers";
import {
  applyBreakoutDimension,
  applyProjection,
  buildBinnedBreakoutDefinition,
  buildExecutableDefinition,
  getDefinitionColumnName,
  getDefinitionName,
  getProjectionInfo,
} from "./definition-builder";
import { buildDimensionFilterClause, parseFilter } from "./dimension-filters";

const metadata = createMetricMetadata([REVENUE_METRIC]);

describe("getDefinitionName", () => {
  it("returns metric name for metric-based definition", () => {
    const definition = setupDefinition(metadata, REVENUE_METRIC.id);
    expect(getDefinitionName(definition)).toBe("Revenue");
  });

  it("returns measure name for measure-based definition", () => {
    const definition = setupMeasureDefinition(
      measureMetadata,
      TOTAL_MEASURE.id,
    );
    expect(getDefinitionName(definition)).toBe("Total Revenue");
  });
});

describe("getDefinitionColumnName", () => {
  it("returns column name for metric-based definition", () => {
    const definition = setupDefinition(metadata, REVENUE_METRIC.id);
    expect(getDefinitionColumnName(definition)).toBe("revenue");
  });

  it("returns column name for measure-based definition", () => {
    const definition = setupMeasureDefinition(
      measureMetadata,
      TOTAL_MEASURE.id,
    );
    expect(getDefinitionColumnName(definition)).toBe("total_revenue");
  });
});

describe("applyProjection", () => {
  describe("metric", () => {
    it("replaces all existing projections with the given dimension", () => {
      const definition = setupDefinitionWithBreakout(
        metadata,
        REVENUE_METRIC.id,
        0,
      );
      const dimensions = LibMetric.projectionableDimensions(definition);
      const categoryReference = LibMetric.dimensionReference(dimensions[1]);

      const result = applyProjection(definition, categoryReference);
      const resultProjections = LibMetric.projections(result);

      expect(resultProjections).toHaveLength(1);
      const projectedDimension = LibMetric.projectionDimension(
        result,
        resultProjections[0],
      );
      expect(
        LibMetric.displayInfo(result, projectedDimension!).displayName,
      ).toBe("Category");
    });
  });

  describe("measure", () => {
    it("replaces all existing projections with the given dimension", () => {
      const definition = setupMeasureDefinitionWithBreakout(
        measureMetadata,
        TOTAL_MEASURE.id,
        0,
      );
      const dimensions = LibMetric.projectionableDimensions(definition);
      const quantityReference = LibMetric.dimensionReference(dimensions[1]);

      const result = applyProjection(definition, quantityReference);
      const resultProjections = LibMetric.projections(result);

      expect(resultProjections).toHaveLength(1);
      const projectedDimension = LibMetric.projectionDimension(
        result,
        resultProjections[0],
      );
      expect(
        LibMetric.displayInfo(result, projectedDimension!).displayName,
      ).toBe("Quantity");
    });
  });
});

describe("getProjectionInfo", () => {
  describe("metric", () => {
    it("returns empty info for definition with no projections", () => {
      const definition = setupDefinition(metadata, REVENUE_METRIC.id);
      expect(getProjectionInfo(definition)).toMatchObject({
        projection: undefined,
        projectionDimension: undefined,
        isTemporalBucketable: false,
        isBinnable: false,
        hasBinning: false,
      });
    });

    it("returns temporal info for definition projected on DateTime dimension", () => {
      const definition = setupDefinitionWithBreakout(
        metadata,
        REVENUE_METRIC.id,
        0,
      );
      const info = getProjectionInfo(definition);

      expect(
        LibMetric.displayInfo(definition, info.projectionDimension!)
          .displayName,
      ).toBe("Created At");
      expect(info.isTemporalBucketable).toBe(true);
      expect(info.isBinnable).toBe(false);
      expect(info.hasBinning).toBe(false);
    });

    it("returns binnable info with hasBinning for binned numeric dimension", () => {
      const definition = setupDefinitionWithBreakout(
        metadata,
        REVENUE_METRIC.id,
        2,
      );
      const projections = LibMetric.projections(definition);
      const binnedDefinition = LibMetric.replaceClause(
        definition,
        projections[0],
        LibMetric.withDefaultBinning(definition, projections[0]),
      );
      const info = getProjectionInfo(binnedDefinition);

      expect(
        LibMetric.displayInfo(binnedDefinition, info.projectionDimension!)
          .displayName,
      ).toBe("Amount");
      expect(info.isTemporalBucketable).toBe(false);
      expect(info.isBinnable).toBe(true);
      expect(info.hasBinning).toBe(true);
    });
  });

  describe("measure", () => {
    it("returns temporal info for definition projected on DateTime dimension", () => {
      const definition = setupMeasureDefinitionWithBreakout(
        measureMetadata,
        TOTAL_MEASURE.id,
        0,
      );
      const info = getProjectionInfo(definition);

      expect(
        LibMetric.displayInfo(definition, info.projectionDimension!)
          .displayName,
      ).toBe("Created At");
      expect(info.isTemporalBucketable).toBe(true);
      expect(info.isBinnable).toBe(false);
    });

    it("returns binnable info for definition projected on numeric dimension", () => {
      const definition = setupMeasureDefinitionWithBreakout(
        measureMetadata,
        TOTAL_MEASURE.id,
        2,
      );
      const info = getProjectionInfo(definition);

      expect(
        LibMetric.displayInfo(definition, info.projectionDimension!)
          .displayName,
      ).toBe("Total");
      expect(info.isBinnable).toBe(true);
      expect(info.isTemporalBucketable).toBe(false);
    });
  });
});

describe("buildExecutableDefinition", () => {
  describe("metric", () => {
    it("applies specified temporal unit for temporal dimension", () => {
      const definition = setupDefinition(metadata, REVENUE_METRIC.id);
      const dimensions = LibMetric.projectionableDimensions(definition);
      const result = buildExecutableDefinition(definition, dimensions[0], {
        projectionTemporalUnit: "year",
      })!;

      const resultProjections = LibMetric.projections(result);
      const bucket = LibMetric.temporalBucket(resultProjections[0]);
      expect(LibMetric.displayInfo(result, bucket!).shortName).toBe("year");
    });

    it("applies default temporal bucket when no unit specified", () => {
      const definition = setupDefinition(metadata, REVENUE_METRIC.id);
      const dimensions = LibMetric.projectionableDimensions(definition);
      const result = buildExecutableDefinition(definition, dimensions[0], {})!;

      const resultProjections = LibMetric.projections(result);
      const bucket = LibMetric.temporalBucket(resultProjections[0]);
      expect(LibMetric.displayInfo(result, bucket!).shortName).toBe("month");
    });
  });

  describe("measure", () => {
    it("applies specified temporal unit for temporal dimension", () => {
      const definition = setupMeasureDefinition(
        measureMetadata,
        TOTAL_MEASURE.id,
      );
      const dimensions = LibMetric.projectionableDimensions(definition);
      const result = buildExecutableDefinition(definition, dimensions[0], {
        projectionTemporalUnit: "year",
      })!;

      const resultProjections = LibMetric.projections(result);
      const bucket = LibMetric.temporalBucket(resultProjections[0]);
      expect(LibMetric.displayInfo(result, bucket!).shortName).toBe("year");
    });
  });

  it("preserves global filters when tab-level filter targets the same dimension", () => {
    const definition = setupDefinition(metadata, REVENUE_METRIC.id);
    const dimensions = LibMetric.projectionableDimensions(definition);
    const categoryDimension = dimensions.find(
      (dimension) =>
        LibMetric.displayInfo(definition, dimension).displayName === "Category",
    )!;

    const globalFilterClause = buildDimensionFilterClause(categoryDimension, {
      type: "string",
      operator: "=",
      values: ["Gadget"],
      options: {},
    });
    const definitionWithGlobalFilter = LibMetric.filter(
      definition,
      globalFilterClause,
    );

    expect(LibMetric.filters(definitionWithGlobalFilter)).toHaveLength(1);

    const result = buildExecutableDefinition(
      definitionWithGlobalFilter,
      categoryDimension,
      {
        dimensionFilter: {
          type: "string",
          operator: "=",
          values: ["Widget"],
          options: {},
        },
      },
    )!;

    const resultFilters = LibMetric.filters(result);
    expect(resultFilters).toHaveLength(2);

    const parsedFilters = resultFilters.map(
      (filter) => parseFilter(result, filter)!.value,
    );
    expect(parsedFilters).toEqual(
      expect.arrayContaining([
        { type: "string", operator: "=", values: ["Gadget"], options: null },
        { type: "string", operator: "=", values: ["Widget"], options: null },
      ]),
    );
  });
});

describe("buildBinnedBreakoutDefinition", () => {
  describe("metric", () => {
    it("applies default binning to a binnable dimension", () => {
      const definition = setupDefinition(metadata, REVENUE_METRIC.id);
      const dimensions = LibMetric.projectionableDimensions(definition);
      const dimensionReference = LibMetric.dimensionReference(dimensions[2]);

      const result = buildBinnedBreakoutDefinition(
        definition,
        dimensionReference,
      );
      const resultProjections = LibMetric.projections(result);
      expect(resultProjections).toHaveLength(1);
      expect(LibMetric.binning(resultProjections[0])).not.toBeNull();
    });

    it("preserves existing temporal bucket via early return", () => {
      const definition = setupDefinitionWithBreakout(
        metadata,
        REVENUE_METRIC.id,
        0,
      );
      const projections = LibMetric.projections(definition);
      const bucketedProjection = LibMetric.withDefaultTemporalBucket(
        definition,
        projections[0],
      );

      const result = buildBinnedBreakoutDefinition(
        definition,
        bucketedProjection,
      );
      const resultProjections = LibMetric.projections(result);
      expect(LibMetric.temporalBucket(resultProjections[0])).not.toBeNull();
    });
  });

  describe("measure", () => {
    it("applies default binning to a binnable dimension", () => {
      const definition = setupMeasureDefinition(
        measureMetadata,
        TOTAL_MEASURE.id,
      );
      const dimensions = LibMetric.projectionableDimensions(definition);
      const dimensionReference = LibMetric.dimensionReference(dimensions[2]);

      const result = buildBinnedBreakoutDefinition(
        definition,
        dimensionReference,
      );
      const resultProjections = LibMetric.projections(result);
      expect(resultProjections).toHaveLength(1);
      expect(LibMetric.binning(resultProjections[0])).not.toBeNull();
    });
  });
});

describe("applyBreakoutDimension", () => {
  describe("metric", () => {
    it("adds breakout dimension as additional projection", () => {
      const baseDefinition = setupDefinition(metadata, REVENUE_METRIC.id);
      const dimensions = LibMetric.projectionableDimensions(baseDefinition);
      const executableDefinition = setupDefinitionWithBreakout(
        metadata,
        REVENUE_METRIC.id,
        0,
      );

      const categoryReference = LibMetric.dimensionReference(dimensions[1]);
      const result = applyBreakoutDimension(
        baseDefinition,
        executableDefinition,
        categoryReference,
      );
      expect(LibMetric.projections(result)).toHaveLength(2);
    });

    it("applies default binning for binnable breakout dimension", () => {
      const baseDefinition = setupDefinition(metadata, REVENUE_METRIC.id);
      const dimensions = LibMetric.projectionableDimensions(baseDefinition);
      const executableDefinition = setupDefinitionWithBreakout(
        metadata,
        REVENUE_METRIC.id,
        0,
      );

      const amountReference = LibMetric.dimensionReference(dimensions[2]);
      const result = applyBreakoutDimension(
        baseDefinition,
        executableDefinition,
        amountReference,
      );
      const resultProjections = LibMetric.projections(result);
      expect(
        LibMetric.binning(resultProjections[resultProjections.length - 1]),
      ).not.toBeNull();
    });
  });

  describe("measure", () => {
    it("adds breakout dimension as additional projection", () => {
      const baseDefinition = setupMeasureDefinition(
        measureMetadata,
        TOTAL_MEASURE.id,
      );
      const dimensions = LibMetric.projectionableDimensions(baseDefinition);
      const executableDefinition = setupMeasureDefinitionWithBreakout(
        measureMetadata,
        TOTAL_MEASURE.id,
        0,
      );

      const quantityReference = LibMetric.dimensionReference(dimensions[1]);
      const result = applyBreakoutDimension(
        baseDefinition,
        executableDefinition,
        quantityReference,
      );
      expect(LibMetric.projections(result)).toHaveLength(2);
    });
  });
});
