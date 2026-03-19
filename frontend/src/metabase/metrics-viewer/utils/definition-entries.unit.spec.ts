import * as LibMetric from "metabase-lib/metric";

import type { MetricsViewerDefinitionEntry } from "../types/viewer-state";

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
import { entryHasBreakout, getEntryBreakout } from "./definition-entries";

const metricMeta = createMetricMetadata([REVENUE_METRIC]);

describe("getEntryBreakout", () => {
  it("returns undefined when entry.definition is null", () => {
    const entry: MetricsViewerDefinitionEntry = {
      id: "metric:1",
      definition: null,
    };
    expect(getEntryBreakout(entry)).toBeUndefined();
  });

  describe("metric", () => {
    it("returns undefined for definition with no projections", () => {
      const definition = setupDefinition(metricMeta, REVENUE_METRIC.id);
      const entry: MetricsViewerDefinitionEntry = {
        id: "metric:1",
        definition,
      };
      expect(getEntryBreakout(entry)).toBeUndefined();
    });

    it("returns the first projection for definition with a breakout", () => {
      const definition = setupDefinitionWithBreakout(
        metricMeta,
        REVENUE_METRIC.id,
        0,
      );
      const entry: MetricsViewerDefinitionEntry = {
        id: "metric:1",
        definition,
      };
      const breakout = getEntryBreakout(entry)!;
      const breakoutDimension = LibMetric.projectionDimension(
        definition,
        breakout,
      );
      expect(
        LibMetric.displayInfo(definition, breakoutDimension!).displayName,
      ).toBe("Created At");
    });
  });

  describe("measure", () => {
    it("returns undefined for definition with no projections", () => {
      const definition = setupMeasureDefinition(
        measureMetadata,
        TOTAL_MEASURE.id,
      );
      const entry: MetricsViewerDefinitionEntry = {
        id: "measure:100",
        definition,
      };
      expect(getEntryBreakout(entry)).toBeUndefined();
    });

    it("returns the first projection for definition with a breakout", () => {
      const definition = setupMeasureDefinitionWithBreakout(
        measureMetadata,
        TOTAL_MEASURE.id,
        0,
      );
      const entry: MetricsViewerDefinitionEntry = {
        id: "measure:100",
        definition,
      };
      const breakout = getEntryBreakout(entry)!;
      const breakoutDimension = LibMetric.projectionDimension(
        definition,
        breakout,
      );
      expect(
        LibMetric.displayInfo(definition, breakoutDimension!).displayName,
      ).toBe("Created At");
    });
  });
});

describe("entryHasBreakout", () => {
  describe("metric", () => {
    it("returns false for definition with no projections", () => {
      const definition = setupDefinition(metricMeta, REVENUE_METRIC.id);
      const entry: MetricsViewerDefinitionEntry = {
        id: "metric:1",
        definition,
      };
      expect(entryHasBreakout(entry)).toBe(false);
    });

    it("returns true for definition with a breakout", () => {
      const definition = setupDefinitionWithBreakout(
        metricMeta,
        REVENUE_METRIC.id,
        0,
      );
      const entry: MetricsViewerDefinitionEntry = {
        id: "metric:1",
        definition,
      };
      expect(entryHasBreakout(entry)).toBe(true);
    });
  });

  describe("measure", () => {
    it("returns false for definition with no projections", () => {
      const definition = setupMeasureDefinition(
        measureMetadata,
        TOTAL_MEASURE.id,
      );
      const entry: MetricsViewerDefinitionEntry = {
        id: "measure:100",
        definition,
      };
      expect(entryHasBreakout(entry)).toBe(false);
    });

    it("returns true for definition with a breakout", () => {
      const definition = setupMeasureDefinitionWithBreakout(
        measureMetadata,
        TOTAL_MEASURE.id,
        0,
      );
      const entry: MetricsViewerDefinitionEntry = {
        id: "measure:100",
        definition,
      };
      expect(entryHasBreakout(entry)).toBe(true);
    });
  });
});
