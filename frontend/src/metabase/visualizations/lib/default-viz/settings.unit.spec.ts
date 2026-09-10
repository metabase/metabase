import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";

import { columnMappingNames, settingsFor, xAxisScale } from "./settings";
import {
  avgMeasure,
  candidate,
  categoryDim,
  countMeasure,
  makeProfile,
  makeRowStats,
  makeShape,
  timeDim,
} from "./test-fixtures";

describe("settingsFor", () => {
  it("emits cartesian dimensions, metrics, scale and show_values for a small bar", () => {
    const profiles = [categoryDim(0, "CATEGORY", 4), countMeasure(1)];
    const { settings, suggestedOrderBy } = settingsFor(
      candidate("bar", null, { x: [0], metrics: [1] }),
      makeShape(profiles),
      profiles,
      null,
    );
    expect(settings).toEqual({
      "graph.dimensions": ["CATEGORY"],
      "graph.metrics": ["count"],
      "graph.x_axis.scale": "ordinal",
      "graph.show_values": true,
    });
    expect(suggestedOrderBy).toEqual({
      columnName: "count",
      direction: "desc",
    });
  });

  it("emits stacking, series dimension and compact axis labels", () => {
    const profiles = [
      categoryDim(0, "SOURCE", 40),
      categoryDim(1, "CATEGORY", 4),
      countMeasure(2),
    ];
    const { settings } = settingsFor(
      candidate("bar", "stacked", { x: [0], series: [1], metrics: [2] }),
      makeShape(profiles),
      profiles,
      null,
    );
    expect(settings).toMatchObject({
      "graph.dimensions": ["SOURCE", "CATEGORY"],
      "stackable.stack_type": "stacked",
      "graph.x_axis.axis_enabled": "compact",
    });
    expect(settings["graph.show_values"]).toBeUndefined();
  });

  it("splits axes and marks combo series by measure kind", () => {
    const profiles = [timeDim(0, "CREATED_AT"), countMeasure(1), avgMeasure(2)];
    const shape = makeShape(profiles);
    expect(
      settingsFor(
        candidate("line", "auto-split", { x: [0], metrics: [1, 2] }),
        shape,
        profiles,
        null,
      ).settings,
    ).toMatchObject({
      "graph.y_axis.auto_split": true,
      "graph.x_axis.scale": "timeseries",
    });
    expect(
      settingsFor(
        candidate("combo", null, { x: [0], metrics: [1, 2] }),
        shape,
        profiles,
        null,
      ).settings.series_settings,
    ).toEqual({ count: { display: "bar" }, avg: { display: "line" } });
  });

  it("hides missing time buckets when the series has gaps", () => {
    const profiles = [timeDim(0, "CREATED_AT"), countMeasure(1)];
    const rowStats = makeRowStats({
      timeSeries: {
        0: {
          sorted: true,
          regular: true,
          missingBucketFrac: 0.3,
          allDistinct: true,
          inferredUnit: "month",
        },
      },
    });
    const { settings } = settingsFor(
      candidate("line", null, { x: [0], metrics: [1] }),
      makeShape(profiles),
      profiles,
      rowStats,
    );
    expect(settings.series_settings).toEqual({
      count: { "line.missing": "none" },
    });
  });

  it("emits pie, funnel and scalar settings", () => {
    const profiles = [categoryDim(0, "status", 5), countMeasure(1)];
    const shape = makeShape(profiles);
    expect(
      settingsFor(
        candidate("pie", null, { x: [0], metrics: [1] }),
        shape,
        profiles,
        null,
      ).settings,
    ).toEqual({
      "pie.dimension": ["status"],
      "pie.metric": "count",
      "pie.show_legend": true,
      "pie.percent_visibility": "legend",
      "pie.slice_threshold": 2.5,
    });
    expect(
      settingsFor(
        candidate("funnel", null, { x: [0], metrics: [1] }),
        shape,
        profiles,
        null,
      ).settings,
    ).toEqual({
      "funnel.dimension": "status",
      "funnel.metric": "count",
      "funnel.type": "funnel",
    });
    const currency = makeProfile({
      index: 0,
      name: "sum",
      role: "MEASURE",
      type: "number",
      semantic: "type/Currency",
    });
    const scalarProfiles = [currency, countMeasure(1)];
    expect(
      settingsFor(
        candidate("scalar", null, { scalarField: [0] }),
        makeShape(scalarProfiles),
        scalarProfiles,
        null,
      ).settings,
    ).toEqual({
      "scalar.field": "sum",
      column_settings: {
        [getColumnKey({ name: "sum" })]: { number_style: "currency" },
      },
    });
  });

  it("emits map settings with tiles for large pin maps", () => {
    const lat = makeProfile({
      index: 0,
      name: "lat",
      role: "DIM_GEO_LATLON",
      type: "number",
      geo: { kind: "lat" },
    });
    const lon = makeProfile({
      index: 1,
      name: "lon",
      role: "DIM_GEO_LATLON",
      type: "number",
      geo: { kind: "lon" },
    });
    const profiles = [lat, lon];
    const big = makeShape(profiles, {
      aggregated: false,
      rowCount: 5000,
      rowCountExact: true,
    });
    expect(
      settingsFor(
        candidate("map", "pin", { lat: [0], lon: [1] }),
        big,
        profiles,
        null,
      ).settings,
    ).toEqual({
      "map.type": "pin",
      "map.latitude_column": "lat",
      "map.longitude_column": "lon",
      "map.pin_type": "tiles",
    });
    const state = makeProfile({
      index: 0,
      name: "STATE",
      role: "DIM_GEO_REGION",
      geo: { kind: "state", region: "us_states" },
    });
    const regionProfiles = [state, countMeasure(1)];
    expect(
      settingsFor(
        candidate("map", "region", { region: [0], metrics: [1] }),
        makeShape(regionProfiles),
        regionProfiles,
        null,
      ).settings,
    ).toEqual({
      "map.type": "region",
      "map.region": "us_states",
      "map.dimension": "STATE",
      "map.metric": "count",
    });
  });

  it("emits pivot splits and mini-bar column settings", () => {
    const profiles = [
      timeDim(0, "CREATED_AT", "year"),
      categoryDim(1, "STATE", 49),
      avgMeasure(2),
    ];
    const shape = makeShape(profiles);
    expect(
      settingsFor(
        candidate("pivot", null, {
          pivotColumns: [0],
          pivotRows: [1],
          metrics: [2],
        }),
        shape,
        profiles,
        null,
      ).settings,
    ).toEqual({
      "pivot_table.column_split": {
        rows: ["STATE"],
        columns: ["CREATED_AT"],
        values: ["avg"],
      },
      "pivot.show_row_totals": false,
      "pivot.show_column_totals": false,
    });
    expect(
      settingsFor(
        candidate("table", "mini-bar", { metrics: [2] }),
        shape,
        profiles,
        null,
      ).settings,
    ).toEqual({
      column_settings: {
        [getColumnKey({ name: "avg" })]: { show_mini_bar: true },
      },
    });
  });

  it("maps x-axis scales from roles", () => {
    expect(xAxisScale(timeDim(0, "t"))).toBe("timeseries");
    expect(
      xAxisScale(makeProfile({ index: 0, name: "b", role: "DIM_BINNED" })),
    ).toBe("histogram");
    expect(
      xAxisScale(makeProfile({ index: 0, name: "n", role: "DIM_NUMERIC" })),
    ).toBe("linear");
    expect(xAxisScale(categoryDim(0, "c", 3))).toBe("ordinal");
  });
});

describe("columnMappingNames", () => {
  it("translates mapped indexes to column names", () => {
    const profiles = [categoryDim(0, "CATEGORY", 4), countMeasure(1)];
    expect(
      columnMappingNames(
        candidate("bar", null, { x: [0], metrics: [1] }),
        profiles,
      ),
    ).toEqual({
      x: ["CATEGORY"],
      metrics: ["count"],
    });
  });
});
