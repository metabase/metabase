import * as LibMetric from "metabase-lib/metric";
import { createMockColumn } from "metabase-types/api/mocks";

import type {
  BreakoutColorMap,
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerFormulaEntity,
} from "../types/viewer-state";

import {
  GEO_DIM_IDX,
  GEO_METRIC,
  REVENUE_METRIC,
  createMetricMetadata,
  setupDefinition,
} from "./__tests__/test-helpers";
import { DISPLAY_TYPE_REGISTRY, getTabConfig } from "./tab-config";

const allMetadata = createMetricMetadata([REVENUE_METRIC, GEO_METRIC]);
const revenueDefinition = setupDefinition(allMetadata, REVENUE_METRIC.id);
const geoDefinition = setupDefinition(allMetadata, GEO_METRIC.id);
const revenueDimensions = LibMetric.projectionableDimensions(revenueDefinition);
const geoDimensions = LibMetric.projectionableDimensions(geoDefinition);

const REV_DIM_IDX = {
  DATE_TIME: 0,
  CATEGORY: 1,
  AMOUNT: 2,
  BOOLEAN: 3,
};

// ── Column fixtures ──

const dimensionCol = createMockColumn({
  name: "CREATED_AT",
  display_name: "Created At",
  base_type: "type/DateTime",
});

const breakoutCol = createMockColumn({
  name: "CATEGORY",
  display_name: "Category",
  base_type: "type/Text",
});

const metricCol = createMockColumn({
  name: "COUNT",
  display_name: "Count",
  base_type: "type/Integer",
});

const stateCol = createMockColumn({
  name: "STATE",
  display_name: "State",
  base_type: "type/Text",
  semantic_type: "type/State",
});

const countryCol = createMockColumn({
  name: "COUNTRY",
  display_name: "Country",
  base_type: "type/Text",
  semantic_type: "type/Country",
});

const cityCol = createMockColumn({
  name: "CITY",
  display_name: "City",
  base_type: "type/Text",
  semantic_type: "type/City",
});

const latitudeCol = createMockColumn({
  name: "LATITUDE",
  display_name: "Latitude",
  base_type: "type/Float",
  semantic_type: "type/Latitude",
});

// ── Shared helpers ──

const METRIC_ENTITY: MetricsViewerFormulaEntity = {
  id: "metric:1" as MetricSourceId,
  type: "metric",
  definition: null,
};

const DEFAULT_PARAMS = {
  entity: METRIC_ENTITY,
  isFirstSeries: true,
  hasMultipleSeries: false,
  cardName: "Revenue",
  definitions: {},
};

function makeColorMap(values: string[]): BreakoutColorMap {
  const palette = ["#509EE3", "#88BF4D", "#A989C5"];
  return new Map(values.map((v, i) => [v, palette[i % palette.length]]));
}

// ── getTabConfig ──

describe("getTabConfig", () => {
  it("returns config for time tab", () => {
    expect(getTabConfig("time")).toEqual(
      expect.objectContaining({
        type: "time",
        autoCreate: true,
        matchMode: "aggregate",
        fixedId: "time",
        defaultDisplayType: "line",
        availableDisplayTypes: [
          { type: "line", icon: "line" },
          { type: "area", icon: "area" },
          { type: "bar", icon: "bar" },
        ],
      }),
    );
  });

  it("returns config for geo tab", () => {
    expect(getTabConfig("geo")).toEqual(
      expect.objectContaining({
        type: "geo",
        autoCreate: true,
        matchMode: "aggregate",
        fixedId: "geo",
        defaultDisplayType: "map",
        availableDisplayTypes: [
          { type: "map", icon: "pinmap" },
          { type: "line", icon: "line" },
          { type: "area", icon: "area" },
          { type: "bar", icon: "bar" },
        ],
      }),
    );
  });

  it("returns config for category tab", () => {
    expect(getTabConfig("category")).toEqual(
      expect.objectContaining({
        type: "category",
        autoCreate: true,
        matchMode: "exact-column",
        defaultDisplayType: "bar",
        availableDisplayTypes: [
          { type: "line", icon: "line" },
          { type: "area", icon: "area" },
          { type: "bar", icon: "bar" },
        ],
      }),
    );
  });

  it("returns config for boolean tab", () => {
    expect(getTabConfig("boolean")).toEqual(
      expect.objectContaining({
        type: "boolean",
        autoCreate: true,
        matchMode: "exact-column",
        defaultDisplayType: "bar",
        availableDisplayTypes: [
          { type: "line", icon: "line" },
          { type: "area", icon: "area" },
          { type: "bar", icon: "bar" },
        ],
      }),
    );
  });

  it("returns config for numeric tab", () => {
    expect(getTabConfig("numeric")).toEqual(
      expect.objectContaining({
        type: "numeric",
        autoCreate: false,
        matchMode: "exact-column",
        defaultDisplayType: "bar",
        availableDisplayTypes: [
          { type: "line", icon: "line" },
          { type: "area", icon: "area" },
          { type: "bar", icon: "bar" },
          { type: "scatter", icon: "bubble" },
        ],
      }),
    );
  });

  it("throws for unknown tab type", () => {
    expect(() => getTabConfig("unknown" as any)).toThrow(
      "No tab config found for type: unknown",
    );
  });
});

// ── Dimension predicates ──

describe("TAB_TYPE_REGISTRY", () => {
  describe("dimension predicates", () => {
    const timeConfig = getTabConfig("time");
    const geoConfig = getTabConfig("geo");
    const categoryConfig = getTabConfig("category");
    const booleanConfig = getTabConfig("boolean");
    const numericConfig = getTabConfig("numeric");

    it("time predicate matches datetime dimensions", () => {
      expect(
        timeConfig.dimensionPredicate(revenueDimensions[REV_DIM_IDX.DATE_TIME]),
      ).toBe(true);
    });

    it("time predicate rejects non-datetime dimensions", () => {
      expect(
        timeConfig.dimensionPredicate(revenueDimensions[REV_DIM_IDX.CATEGORY]),
      ).toBe(false);
    });

    it("geo predicate matches state dimensions", () => {
      expect(
        geoConfig.dimensionPredicate(geoDimensions[GEO_DIM_IDX.STATE]),
      ).toBe(true);
    });

    it("geo predicate matches country dimensions", () => {
      expect(
        geoConfig.dimensionPredicate(geoDimensions[GEO_DIM_IDX.COUNTRY]),
      ).toBe(true);
    });

    it("geo predicate rejects city dimensions", () => {
      expect(
        geoConfig.dimensionPredicate(geoDimensions[GEO_DIM_IDX.CITY]),
      ).toBe(false);
    });

    it("geo predicate rejects latitude dimensions", () => {
      expect(
        geoConfig.dimensionPredicate(geoDimensions[GEO_DIM_IDX.LATITUDE]),
      ).toBe(false);
    });

    it("category predicate matches category dimensions", () => {
      expect(
        categoryConfig.dimensionPredicate(
          revenueDimensions[REV_DIM_IDX.CATEGORY],
        ),
      ).toBe(true);
    });

    it("category predicate rejects geo dimensions", () => {
      expect(
        categoryConfig.dimensionPredicate(geoDimensions[GEO_DIM_IDX.STATE]),
      ).toBe(false);
    });

    it("category predicate rejects boolean dimensions", () => {
      expect(
        categoryConfig.dimensionPredicate(
          revenueDimensions[REV_DIM_IDX.BOOLEAN],
        ),
      ).toBe(false);
    });

    it("boolean predicate matches boolean dimensions", () => {
      expect(
        booleanConfig.dimensionPredicate(
          revenueDimensions[REV_DIM_IDX.BOOLEAN],
        ),
      ).toBe(true);
    });

    it("boolean predicate rejects non-boolean dimensions", () => {
      expect(
        booleanConfig.dimensionPredicate(
          revenueDimensions[REV_DIM_IDX.CATEGORY],
        ),
      ).toBe(false);
    });

    it("numeric predicate rejects latitude (coordinate) dimensions", () => {
      expect(
        numericConfig.dimensionPredicate(geoDimensions[GEO_DIM_IDX.LATITUDE]),
      ).toBe(false);
    });
  });
});

// ── Cartesian getSettings ──

describe("DISPLAY_TYPE_REGISTRY", () => {
  describe("line/area/bar getSettings", () => {
    const getSettings = DISPLAY_TYPE_REGISTRY.line.getSettings;

    it("sets graph.dimensions and graph.metrics from cols", () => {
      const result = getSettings({
        ...DEFAULT_PARAMS,
        cols: [dimensionCol, metricCol],
      });

      expect(result["graph.dimensions"]).toEqual(["CREATED_AT"]);
      expect(result["graph.metrics"]).toEqual(["COUNT"]);
    });

    it("disables axis labels", () => {
      const result = getSettings({
        ...DEFAULT_PARAMS,
        cols: [dimensionCol, metricCol],
      });

      expect(result["graph.x_axis.labels_enabled"]).toBe(false);
      expect(result["graph.y_axis.labels_enabled"]).toBe(false);
    });

    it("includes breakout column in dimensions when breakoutColors provided", () => {
      const result = getSettings({
        ...DEFAULT_PARAMS,
        cols: [dimensionCol, breakoutCol, metricCol],
        breakoutColors: makeColorMap(["Gadgets", "Widgets"]),
      });

      expect(result["graph.dimensions"]).toEqual(["CREATED_AT", "CATEGORY"]);
      expect(result["graph.metrics"]).toEqual(["COUNT"]);
    });

    it("sets series_settings colors from breakoutColors", () => {
      const result = getSettings({
        ...DEFAULT_PARAMS,
        cols: [dimensionCol, breakoutCol, metricCol],
        breakoutColors: makeColorMap(["Gadgets", "Widgets"]),
      });

      expect(result.series_settings).toEqual({
        Gadgets: { color: "#509EE3" },
        Widgets: { color: "#88BF4D" },
      });
    });

    it("prefixes series names with card name when hasMultipleSeries", () => {
      const result = getSettings({
        ...DEFAULT_PARAMS,
        cols: [dimensionCol, breakoutCol, metricCol],
        breakoutColors: makeColorMap(["Gadgets", "Widgets"]),
        hasMultipleSeries: true,
      });

      expect(result.series_settings).toEqual({
        "Revenue: Gadgets": { color: "#509EE3" },
        "Revenue: Widgets": { color: "#88BF4D" },
      });
    });

    it("sets series color from color prop when no breakout (first series)", () => {
      const result = getSettings({
        ...DEFAULT_PARAMS,
        cols: [dimensionCol, metricCol],
        color: "#509EE3",
        isFirstSeries: true,
      });

      expect(result.series_settings).toEqual({
        COUNT: expect.objectContaining({ color: "#509EE3" }),
      });
    });

    it("uses cardName as series key when not first series", () => {
      const result = getSettings({
        ...DEFAULT_PARAMS,
        cols: [dimensionCol, metricCol],
        color: "#509EE3",
        isFirstSeries: false,
      });

      expect(result.series_settings).toEqual({
        Revenue: { color: "#509EE3" },
      });
    });
  });

  describe("scatter getSettings", () => {
    it("includes scatter.bubble setting", () => {
      const result = DISPLAY_TYPE_REGISTRY.scatter.getSettings({
        ...DEFAULT_PARAMS,
        cols: [dimensionCol, metricCol],
      });

      expect("scatter.bubble" in result).toBe(true);
      expect(result["scatter.bubble"]).toBeUndefined();
      expect(result["graph.dimensions"]).toEqual(["CREATED_AT"]);
    });
  });

  // ── Map getSettings (migrated from geo-dimensions tests) ──

  describe("map getSettings", () => {
    const getSettings = DISPLAY_TYPE_REGISTRY.map.getSettings;

    it("returns us_states region for state columns", () => {
      const result = getSettings({
        ...DEFAULT_PARAMS,
        cols: [stateCol, metricCol],
      });

      expect(result["map.type"]).toBe("region");
      expect(result["map.region"]).toBe("us_states");
      expect(result["map.dimension"]).toBe("STATE");
      expect(result["map.metric"]).toBe("COUNT");
    });

    it("returns world_countries region for country columns", () => {
      const result = getSettings({
        ...DEFAULT_PARAMS,
        cols: [countryCol, metricCol],
      });

      expect(result["map.type"]).toBe("region");
      expect(result["map.region"]).toBe("world_countries");
      expect(result["map.dimension"]).toBe("COUNTRY");
      expect(result["map.metric"]).toBe("COUNT");
    });

    it("returns empty settings for city columns (unsupported region)", () => {
      const result = getSettings({
        ...DEFAULT_PARAMS,
        cols: [cityCol, metricCol],
      });

      expect(result).toEqual({});
    });

    it("returns empty settings for latitude columns", () => {
      const result = getSettings({
        ...DEFAULT_PARAMS,
        cols: [latitudeCol, metricCol],
      });

      expect(result).toEqual({});
    });

    it("returns empty settings for datetime columns", () => {
      const result = getSettings({
        ...DEFAULT_PARAMS,
        cols: [dimensionCol, metricCol],
      });

      expect(result).toEqual({});
    });

    it("applies map.colors color scale when color is provided", () => {
      const result = getSettings({
        ...DEFAULT_PARAMS,
        cols: [stateCol, metricCol],
        color: "#509EE3",
      });

      expect(result["map.colors"]).toBeDefined();
    });
  });

  // ── Scalar getSettings ──

  describe("scalar getSettings", () => {
    const getSettings = DISPLAY_TYPE_REGISTRY.scalar.getSettings;

    it("sets scalar.field from the last column name", () => {
      const result = getSettings({
        ...DEFAULT_PARAMS,
        cols: [metricCol],
      });

      expect(result["scalar.field"]).toBe("COUNT");
    });

    it("sets scalar.label to entity name for expression entries", () => {
      const expressionEntity: MetricsViewerFormulaEntity = {
        id: "expr:1" as any,
        type: "expression",
        name: "Revenue Growth",
        tokens: [],
      };

      const result = getSettings({
        ...DEFAULT_PARAMS,
        entity: expressionEntity,
        cols: [metricCol],
      });

      expect(result["scalar.label"]).toBe("Revenue Growth");
      expect(result["scalar.sublabel"]).toBeUndefined();
    });

    it("sets scalar.label from definition name for metric entries", () => {
      const sourceId: MetricSourceId = `metric:${REVENUE_METRIC.id}`;
      const metricEntity: MetricsViewerFormulaEntity = {
        id: sourceId,
        type: "metric",
        definition: revenueDefinition,
      };
      const definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry> =
        {
          [sourceId]: { id: sourceId, definition: revenueDefinition },
        };

      const result = getSettings({
        ...DEFAULT_PARAMS,
        entity: metricEntity,
        cols: [metricCol],
        definitions,
      });

      expect(result["scalar.label"]).toBe("Revenue");
      expect(result["scalar.sublabel"]).toBeUndefined();
    });

    it("adds sublabel when breakoutValue is provided", () => {
      const sourceId: MetricSourceId = `metric:${REVENUE_METRIC.id}`;
      const metricEntity: MetricsViewerFormulaEntity = {
        id: sourceId,
        type: "metric",
        definition: revenueDefinition,
      };
      const definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry> =
        {
          [sourceId]: { id: sourceId, definition: revenueDefinition },
        };

      const result = getSettings({
        ...DEFAULT_PARAMS,
        entity: metricEntity,
        cols: [breakoutCol, metricCol],
        breakoutValue: "Gadgets",
        definitions,
      });

      expect(result["scalar.field"]).toBe("COUNT");
      expect(result["scalar.label"]).toBe("Revenue");
      expect(result["scalar.sublabel"]).toBe("Category: Gadgets");
    });
  });
});
