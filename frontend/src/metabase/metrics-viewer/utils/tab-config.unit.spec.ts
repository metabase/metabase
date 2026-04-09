import * as LibMetric from "metabase-lib/metric";

import {
  GEO_DIM_IDX,
  GEO_METRIC,
  REVENUE_METRIC,
  createMetricMetadata,
  setupDefinition,
} from "./__tests__/test-helpers";
import { getTabConfig } from "./tab-config";

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
