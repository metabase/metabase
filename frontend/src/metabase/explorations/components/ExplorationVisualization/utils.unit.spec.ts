import { OTHER_BUCKET_LABEL } from "metabase/explorations/constants";
import { createQuery } from "metabase/explorations/test-utils";
import { NULL_DISPLAY_VALUE } from "metabase/utils/constants";
import { registerVisualizations } from "metabase/visualizations/register";
import type {
  ClickObject,
  HighlightedObject,
} from "metabase/visualizations/types";
import type {
  Dataset,
  ExplorationQuery,
  RowValues,
  SingleSeries,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockDatetimeColumn,
} from "metabase-types/api/mocks";

import {
  type SeriesGroup,
  buildSeriesGroup,
  canExploreFurther,
  getCommentLabel,
  getExploreFurtherFilters,
  getHeatMapSeries,
} from "./utils";

registerVisualizations();

function makeQuery(
  overrides: Partial<ExplorationQuery> & {
    id: number;
  },
): ExplorationQuery {
  return createQuery({
    status: "done",
    ...overrides,
    name: overrides.name ?? `q-${overrides.id}`,
  });
}

function makeDataset(
  cols: ReturnType<typeof createMockColumn>[],
  rows: RowValues[],
): Dataset {
  return createMockDataset({
    data: createMockDatasetData({ cols, rows }),
  });
}

function makeHeatMapSeries(name: string, rows: RowValues[]): SingleSeries {
  return {
    card: createMockCard({ name, display: "table" }),
    data: createMockDatasetData({
      cols: [
        createMockColumn({ name: "Dimension" }),
        createMockColumn({ name: "Value" }),
      ],
      rows,
    }),
  };
}

function makeTsRows(count: number): RowValues[] {
  return Array.from({ length: count }, (_, i) => [
    `2025-01-${String(i + 1).padStart(2, "0")}`,
    i + 1,
  ]);
}

function makeCategoricalRows(
  categories: RowValues,
  valueFn: (index: number) => number = (index) => index + 1,
): RowValues[] {
  return categories.map((category, index) => [category, valueFn(index)]);
}

const TS_COL = createMockColumn({
  name: "ts",
  base_type: "type/DateTime",
});
const COUNT_COL = createMockColumn({
  name: "count",
  base_type: "type/Integer",
});
const CATEGORY_COL = createMockColumn({
  name: "category",
  base_type: "type/Text",
});
const STATE_COL = createMockColumn({
  name: "state",
  base_type: "type/Text",
  semantic_type: "type/State",
});

/** Enough rows to keep line/bar charts (above the row-fallback threshold). */
const tsDataset = makeDataset([TS_COL, COUNT_COL], makeTsRows(4));
const categoricalDataset = makeDataset(
  [CATEGORY_COL, COUNT_COL],
  makeCategoricalRows(["A", "B", "C", "D"]),
);
const stateDataset = makeDataset([STATE_COL, COUNT_COL], [["CA", 10]]);
const timeFacetDataset = makeDataset(
  [CATEGORY_COL, TS_COL, COUNT_COL],
  makeTsRows(4).map((row) => ["A", row[0], row[1]]),
);

/** Small datasets that trigger the row-chart fallback (at or below threshold). */
const smallTsDataset = makeDataset([TS_COL, COUNT_COL], makeTsRows(1));
const smallCategoricalDataset = makeDataset(
  [CATEGORY_COL, COUNT_COL],
  makeCategoricalRows(["A"]),
);
const smallTimeFacetDataset = makeDataset(
  [CATEGORY_COL, TS_COL, COUNT_COL],
  [["A", "2025-01-01", 1]],
);

function buildSeriesGroupFor(query: ExplorationQuery, dataset: Dataset) {
  return buildSeriesGroup({
    queriesWithDatasets: [{ ...query, dataset }],
  });
}

describe("getHeatMapSeries", () => {
  it("labels the Segment column with the real segment name", () => {
    const { data } = getHeatMapSeries({
      series: [
        makeHeatMapSeries("Revenue by Plan", [["A", 1]]),
        makeHeatMapSeries("Revenue by Plan (Enterprise)", [["A", 2]]),
        makeHeatMapSeries("Revenue by Plan (SMB)", [["A", 3]]),
      ],
      legendItems: [
        { name: "(All)", color: "#509EE3" },
        { name: "Enterprise", color: "#88BF4D" },
        { name: "SMB", color: "#A989C5" },
      ],
    })[0];

    const segmentColumn = data.rows.map((row) => row[row.length - 1]);
    expect(segmentColumn).toEqual(["(All)", "Enterprise", "SMB"]);
  });
});

function makeClickObject(
  overrides: Partial<ClickObject> & {
    dimensions?: ClickObject["dimensions"];
  } = {},
): ClickObject {
  const categoryColumn = createMockColumn({
    name: "category",
    source: "breakout",
    field_ref: ["field", 1, null],
  });
  return {
    value: 10,
    column: createMockColumn({ name: "count", source: "aggregation" }),
    dimensions: [{ column: categoryColumn, value: "Gadget" }],
    settings: {},
    cardId: 101,
    ...overrides,
  };
}

describe("canExploreFurther", () => {
  it("returns false when there are no dimensions", () => {
    expect(
      canExploreFurther(
        makeClickObject({ dimensions: [] }),
        "metric",
        "default",
      ),
    ).toBe(false);
  });

  it("returns false for dimension blocks", () => {
    expect(canExploreFurther(makeClickObject(), "dimension", "default")).toBe(
      false,
    );
  });

  it("returns false for top-n-other clicks on the Other bucket", () => {
    expect(
      canExploreFurther(
        makeClickObject({
          dimensions: [
            {
              column: createMockColumn({
                name: "category",
                source: "breakout",
              }),
              value: OTHER_BUCKET_LABEL,
            },
          ],
        }),
        "metric",
        "top-n-other",
      ),
    ).toBe(false);
  });

  it("returns true for eligible metric-block clicks with real dimension values", () => {
    expect(canExploreFurther(makeClickObject(), "metric", "default")).toBe(
      true,
    );
  });

  it("returns true when multiple dimensions are present", () => {
    expect(
      canExploreFurther(
        makeClickObject({
          dimensions: [
            {
              column: createMockColumn({
                name: "category",
                source: "breakout",
              }),
              value: "Gadget",
            },
            {
              column: createMockColumn({ name: "source", source: "breakout" }),
              value: "Affiliate",
            },
          ],
        }),
        "metric",
        "default",
      ),
    ).toBe(true);
  });

  it("returns true for brush clicks with a field_ref on metric blocks", () => {
    expect(
      canExploreFurther(
        {
          brushRange: {
            type: "temporal",
            start: "2020-01-01T00:00:00",
            end: "2020-03-01T00:00:00",
          },
          column: createMockDatetimeColumn({
            name: "CREATED_AT",
            field_ref: ["field", 20, null],
          }),
          event: new MouseEvent("click"),
          settings: {},
        },
        "metric",
        "default",
      ),
    ).toBe(true);
  });

  it("returns false for brush clicks on dimension blocks", () => {
    expect(
      canExploreFurther(
        {
          brushRange: {
            type: "numeric",
            start: 1,
            end: 4,
          },
          column: createMockColumn({
            name: "PRICE",
            field_ref: ["field", 21, null],
          }),
          event: new MouseEvent("click"),
          settings: {},
        },
        "dimension",
        "default",
      ),
    ).toBe(false);
  });
});

describe("getExploreFurtherFilters", () => {
  it("projects dimensions with field_ref into explore filters", () => {
    const clicked = makeClickObject({
      dimensions: [
        {
          column: createMockColumn({
            name: "category",
            source: "breakout",
            field_ref: ["field", 10, null],
          }),
          value: "Gadget",
        },
        {
          column: createMockColumn({
            name: "source",
            source: "breakout",
            field_ref: ["field", 11, null],
          }),
          value: "Affiliate",
        },
      ],
    });

    expect(getExploreFurtherFilters(clicked)).toEqual([
      {
        operator: "=",
        field_ref: ["field", 10, null],
        value: "Gadget",
        display_value: "Gadget",
      },
      {
        operator: "=",
        field_ref: ["field", 11, null],
        value: "Affiliate",
        display_value: "Affiliate",
      },
    ]);
  });

  it("preserves null dimension values when field_ref is present", () => {
    const clicked = makeClickObject({
      dimensions: [
        {
          column: createMockColumn({
            name: "category",
            source: "breakout",
            field_ref: ["field", 10, null],
          }),
          value: null,
        },
      ],
    });

    expect(getExploreFurtherFilters(clicked)).toEqual([
      {
        operator: "=",
        field_ref: ["field", 10, null],
        value: null,
        display_value: NULL_DISPLAY_VALUE,
      },
    ]);
  });

  it("clamps a temporal brush range to the dots inside the brush", () => {
    const column = createMockDatetimeColumn({
      name: "CREATED_AT",
      source: "breakout",
      unit: "month",
      field_ref: ["field", 20, { "temporal-unit": "month" }],
    });
    // Brush from mid-Jan to mid-Mar: Jan's dot (Jan 1) is outside, so the
    // filter clamps to Feb 1 – Mar 1 (same as Lib.updateTemporalFilter).
    const clicked: ClickObject = {
      brushRange: {
        type: "temporal",
        start: "2020-01-15T14:30:00",
        end: "2020-03-10T09:05:00",
      },
      column,
      event: new MouseEvent("click"),
      settings: {
        column: () => ({ column, date_abbreviate: true }),
      },
    };

    expect(getExploreFurtherFilters(clicked)).toEqual([
      {
        operator: "between",
        field_ref: ["field", 20, { "temporal-unit": "month" }],
        values: ["2020-02-01T00:00:00", "2020-03-01T00:00:00"],
        display_value: "Feb 2020 – Mar 2020",
      },
    ]);
  });

  it("returns an equality filter when a temporal brush covers a single dot", () => {
    const column = createMockDatetimeColumn({
      name: "CREATED_AT",
      source: "breakout",
      unit: "month",
      field_ref: ["field", 20, { "temporal-unit": "month" }],
    });
    const clicked: ClickObject = {
      brushRange: {
        type: "temporal",
        // After clamp: start = Feb 1, end = Feb 1
        start: "2020-01-15T14:30:00",
        end: "2020-02-20T09:05:00",
      },
      column,
      event: new MouseEvent("click"),
      settings: {
        column: () => ({ column, date_abbreviate: true }),
      },
    };

    expect(getExploreFurtherFilters(clicked)).toEqual([
      {
        operator: "=",
        field_ref: ["field", 20, { "temporal-unit": "month" }],
        value: "2020-02-01T00:00:00",
        display_value: "Feb 2020",
      },
    ]);
  });

  it("returns no filters when a temporal brush covers no dots", () => {
    const column = createMockDatetimeColumn({
      name: "CREATED_AT",
      source: "breakout",
      unit: "month",
      field_ref: ["field", 20, { "temporal-unit": "month" }],
    });
    const clicked: ClickObject = {
      brushRange: {
        type: "temporal",
        // Entirely within January after the Jan 1 dot
        start: "2020-01-15T14:30:00",
        end: "2020-01-20T09:05:00",
      },
      column,
      event: new MouseEvent("click"),
      settings: {},
    };

    expect(getExploreFurtherFilters(clicked)).toEqual([]);
    expect(canExploreFurther(clicked, "metric", "default")).toBe(false);
  });

  it("projects a numeric brush range into a between explore filter", () => {
    const column = createMockColumn({
      name: "PRICE",
      source: "breakout",
      base_type: "type/Integer",
      effective_type: "type/Integer",
      field_ref: ["field", 21, null],
    });
    const clicked: ClickObject = {
      brushRange: {
        type: "numeric",
        start: 1,
        end: 4,
      },
      column,
      event: new MouseEvent("click"),
      settings: {},
    };

    expect(getExploreFurtherFilters(clicked)).toEqual([
      {
        operator: "between",
        field_ref: ["field", 21, null],
        values: [1, 4],
        display_value: "1 - 4",
      },
    ]);
  });
});

describe("getCommentLabel", () => {
  const categoryColumn = createMockColumn({
    name: "category",
    base_type: "type/Text",
  });
  const tsColumn = createMockColumn({
    name: "ts",
    base_type: "type/DateTime",
    unit: "month",
  });

  function makeSeriesGroup(
    series: SingleSeries[],
    legendItems: SeriesGroup["legendItems"],
  ): SeriesGroup {
    return {
      series,
      legendItems,
      isTimeseries: false,
    };
  }

  it("returns null when highlighted or series group is missing", () => {
    const group = makeSeriesGroup([], []);
    expect(getCommentLabel(undefined, group)).toBeNull();
    expect(
      // Unjustified type cast. FIXME
      getCommentLabel({ cardId: 1 } as HighlightedObject, undefined),
    ).toBeNull();
  });

  it("formats a single-series label from dimension values", () => {
    const card = createMockCard({ id: 101, name: "Revenue" });
    const seriesGroup = makeSeriesGroup(
      [
        {
          card,
          data: createMockDatasetData({
            cols: [categoryColumn, createMockColumn({ name: "count" })],
            rows: [["Gadget", 10]],
          }),
        },
      ],
      [{ name: "(All)", color: "#000" }],
    );
    const highlighted: HighlightedObject = {
      cardId: 101,
      columnName: "count",
      dimensions: [{ columnName: "category", value: "Gadget" }],
    };

    expect(getCommentLabel(highlighted, seriesGroup)).toBe("Gadget");
  });

  it("appends the segment name for multi-series groups", () => {
    const seriesGroup = makeSeriesGroup(
      [
        {
          card: createMockCard({ id: 101, name: "US" }),
          data: createMockDatasetData({
            cols: [categoryColumn, createMockColumn({ name: "count" })],
            rows: [["Gadget", 10]],
          }),
        },
        {
          card: createMockCard({ id: 102, name: "EU" }),
          data: createMockDatasetData({
            cols: [categoryColumn, createMockColumn({ name: "count" })],
            rows: [["Gadget", 20]],
          }),
        },
      ],
      [
        { name: "US", color: "#111" },
        { name: "EU", color: "#222" },
      ],
    );

    const highlighted: HighlightedObject = {
      cardId: 102,
      columnName: "count",
      dimensions: [{ columnName: "category", value: "Gadget" }],
    };

    expect(getCommentLabel(highlighted, seriesGroup)).toBe("Gadget, EU");
  });

  it("formats dates and null values for display", () => {
    const seriesGroup = makeSeriesGroup(
      [
        {
          card: createMockCard({ id: 101 }),
          data: createMockDatasetData({
            cols: [tsColumn, createMockColumn({ name: "count" })],
            rows: [["2025-01-01T00:00:00Z", 10]],
          }),
        },
      ],
      [{ name: "(All)", color: "#000" }],
    );

    expect(
      getCommentLabel(
        {
          cardId: 101,
          columnName: "count",
          dimensions: [{ columnName: "ts", value: "2025-01-01T00:00:00Z" }],
        },
        seriesGroup,
      ),
    ).toMatch(/Jan/);

    expect(
      getCommentLabel(
        {
          cardId: 101,
          columnName: "count",
          dimensions: [{ columnName: "ts", value: null }],
        },
        seriesGroup,
      ),
    ).toBe("(empty)");
  });

  it("skips missing columns and unknown card ids", () => {
    const seriesGroup = makeSeriesGroup(
      [
        {
          card: createMockCard({ id: 101 }),
          data: createMockDatasetData({
            cols: [categoryColumn],
            rows: [["Gadget"]],
          }),
        },
      ],
      [{ name: "(All)", color: "#000" }],
    );

    expect(
      getCommentLabel(
        {
          cardId: 999,
          dimensions: [{ columnName: "missing", value: "x" }],
        },
        seriesGroup,
      ),
    ).toBe("");
  });
});

describe("buildSeriesGroup", () => {
  it("disables cartesian axis labels by default", () => {
    const query = makeQuery({ id: 1 });
    const group = buildSeriesGroupFor(query, tsDataset);
    const settings = group.series[0].card.visualization_settings;
    expect(settings["graph.x_axis.labels_enabled"]).toBe(false);
    expect(settings["graph.y_axis.labels_enabled"]).toBe(false);
  });

  it("enables the x-axis label for the 3-column time-facet shape", () => {
    const query = makeQuery({ id: 1, query_type: "time-facet" });
    const group = buildSeriesGroupFor(query, timeFacetDataset);
    const settings = group.series[0].card.visualization_settings;
    expect(settings["graph.x_axis.labels_enabled"]).toBe(true);
    expect(settings["graph.y_axis.labels_enabled"]).toBe(false);
  });

  it("picks line with split panels for a 2-column timeseries dataset", () => {
    const query = makeQuery({ id: 1 });
    const group = buildSeriesGroupFor(query, tsDataset);
    expect(group.series[0].card.display).toBe("line");
    expect(
      group.series[0].card.visualization_settings["graph.split_panels"],
    ).toBe(true);
    expect(group.isTimeseries).toBe(true);
  });

  it("picks a US state map for a 2-column state dataset", () => {
    const query = makeQuery({ id: 1 });
    const dataset = makeDataset(
      [
        createMockColumn({
          name: "state",
          base_type: "type/Text",
          semantic_type: "type/State",
        }),
        createMockColumn({ name: "count", base_type: "type/Integer" }),
      ],
      [["CA", 10]],
    );
    const group = buildSeriesGroupFor(query, dataset);
    expect(group.series[0].card.display).toBe("map");
    expect(group.series[0].card.visualization_settings["map.region"]).toBe(
      "us_states",
    );
  });

  it("picks a world countries map for a 2-column country dataset", () => {
    const query = makeQuery({ id: 1 });
    const dataset = makeDataset(
      [
        createMockColumn({
          name: "country",
          base_type: "type/Text",
          semantic_type: "type/Country",
        }),
        createMockColumn({ name: "count", base_type: "type/Integer" }),
      ],
      [["US", 10]],
    );
    const group = buildSeriesGroupFor(query, dataset);
    expect(group.series[0].card.display).toBe("map");
    expect(group.series[0].card.visualization_settings["map.region"]).toBe(
      "world_countries",
    );
  });

  it("picks bar for a 2-column categorical dataset", () => {
    const query = makeQuery({ id: 1 });
    const group = buildSeriesGroupFor(query, categoricalDataset);
    expect(group.series[0].card.display).toBe("bar");
  });

  it("picks table heat-map when the group has enough segment queries", () => {
    const queries = Array.from({ length: 4 }, (_, i) =>
      makeQuery({ id: i + 1, segment_id: i + 1 }),
    );
    const categorical = makeDataset(
      [
        createMockColumn({ name: "category", base_type: "type/Text" }),
        createMockColumn({ name: "count", base_type: "type/Integer" }),
      ],
      [["A", 1]],
    );
    const group = buildSeriesGroup({
      queriesWithDatasets: queries.map((q) => ({ ...q, dataset: categorical })),
    });
    expect(group.series[0].card.display).toBe("table");
  });

  it("assigns distinct map color ramps per segment name", () => {
    const group = buildSeriesGroup({
      queriesWithDatasets: [
        {
          ...makeQuery({ id: 1, segment_id: 1, segment_name: "US" }),
          dataset: stateDataset,
        },
        {
          ...makeQuery({ id: 2, segment_id: 2, segment_name: "EU" }),
          dataset: stateDataset,
        },
      ],
    });
    const ramp1 = group.series[0].card.visualization_settings["map.colors"];
    const ramp2 = group.series[1].card.visualization_settings["map.colors"];
    expect(ramp1?.[0]).not.toEqual(ramp2?.[0]);
    expect(group.legendItems.map((item) => item.name)).toEqual(["US", "EU"]);
  });

  it("falls back to row for a small timeseries dataset", () => {
    const group = buildSeriesGroupFor(makeQuery({ id: 1 }), smallTsDataset);
    expect(group.series[0].card.display).toBe("row");
  });

  it("falls back to row for a small categorical bar dataset", () => {
    const group = buildSeriesGroupFor(
      makeQuery({ id: 1 }),
      smallCategoricalDataset,
    );
    expect(group.series[0].card.display).toBe("row");
  });

  it("falls back to row for a small time-facet dataset (counts unique dates)", () => {
    const group = buildSeriesGroupFor(
      makeQuery({ id: 1, query_type: "time-facet" }),
      smallTimeFacetDataset,
    );
    expect(group.series[0].card.display).toBe("row");
  });
});
