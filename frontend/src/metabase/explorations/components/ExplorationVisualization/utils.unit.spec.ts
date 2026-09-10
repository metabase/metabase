import {
  CARTESIAN_SERIES_COL_NAME,
  HEAT_MAP_SEGMENT_COL_NAME,
  OTHER_BUCKET_LABEL,
  fallbackSegmentName,
} from "metabase/explorations/constants";
import { createQuery } from "metabase/explorations/test-utils";
import type { HighlightedCommentState } from "metabase/redux/store/explorations";
import { NULL_DISPLAY_VALUE } from "metabase/utils/constants";
import { registerVisualizations } from "metabase/visualizations/register";
import type { ClickObject } from "metabase/visualizations/types";
import type {
  ComputedVisualizationSettings,
  HighlightedObject,
} from "metabase/viz-core";
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
  buildCommentHighlightContext,
  buildHighlightLabel,
  buildSeriesGroup,
  canExploreFurther,
  composeChartsForGroup,
  getExploreFurtherFilters,
  getHeatMapSeries,
  resolveHighlightForSeries,
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
  it("returns false when queryType is omitted", () => {
    expect(canExploreFurther(makeClickObject())).toBe(false);
  });

  it("returns false when there are no dimensions", () => {
    expect(
      canExploreFurther(makeClickObject({ dimensions: [] }), "default"),
    ).toBe(false);
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
        "top-n-other",
      ),
    ).toBe(false);
  });

  it("returns true for eligible metric-block clicks with real dimension values", () => {
    expect(canExploreFurther(makeClickObject(), "default")).toBe(true);
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
        "default",
      ),
    ).toBe(true);
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

  it("keeps an aligned temporal brush start instead of rounding it up a unit", () => {
    const column = createMockDatetimeColumn({
      name: "CREATED_AT",
      source: "breakout",
      unit: "month",
      field_ref: ["field", 20, { "temporal-unit": "month" }],
    });
    // Start is exactly Jan 1, the January bar's tick, so the filter includes it
    // (same as Lib.updateTemporalFilter).
    const clicked: ClickObject = {
      brushRange: {
        type: "temporal",
        start: "2020-01-01T00:00:00",
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
        values: ["2020-01-01T00:00:00", "2020-03-01T00:00:00"],
        display_value: "Jan 2020 – Mar 2020",
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

  it("returns an equality filter when an aligned temporal brush start and end collapse to one dot", () => {
    const column = createMockDatetimeColumn({
      name: "CREATED_AT",
      source: "breakout",
      unit: "month",
      field_ref: ["field", 20, { "temporal-unit": "month" }],
    });
    const clicked: ClickObject = {
      brushRange: {
        type: "temporal",
        start: "2020-02-01T00:00:00",
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
    expect(canExploreFurther(clicked, "default")).toBe(false);
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

describe("resolveHighlightForSeries", () => {
  const categoryColumn = createMockColumn({
    name: "category",
    base_type: "type/Text",
  });
  const countColumn = createMockColumn({
    name: "count",
    source: "aggregation",
  });
  const seriesColumn = createMockColumn({
    name: CARTESIAN_SERIES_COL_NAME,
    source: "breakout",
  });
  const segmentColumn = createMockColumn({
    name: HEAT_MAP_SEGMENT_COL_NAME,
    source: "breakout",
  });

  const queries = [
    makeQuery({ id: 101, segment_name: "US" }),
    makeQuery({ id: 102, segment_name: "EU" }),
  ];
  const queriesById = Object.fromEntries(queries.map((q) => [q.id, q]));

  function commentState(
    queryIds: number[],
    highlighted: HighlightedObject = {
      columnName: "count",
      dimensions: [{ columnName: "category", value: "Gadget" }],
    },
  ): HighlightedCommentState {
    return {
      childTargetId: "7",
      highlighted,
      explorationQueryIds: queryIds,
    };
  }

  function pageSeries(cardIds: number[]): SingleSeries[] {
    return cardIds.map((id) => ({
      card: createMockCard({ id, display: "line" }),
      data: createMockDatasetData({
        cols: [categoryColumn, countColumn],
        rows: [["Gadget", 10]],
      }),
    }));
  }

  function embedSeries(
    display: "line" | "bar" | "table",
    discriminator: "Series" | "Segment",
  ): SingleSeries[] {
    const discCol = discriminator === "Series" ? seriesColumn : segmentColumn;
    return [
      {
        card: createMockCard({ id: 999, display }),
        data: createMockDatasetData({
          cols: [categoryColumn, countColumn, discCol],
          rows: [["Gadget", 10, "EU"]],
        }),
      },
    ];
  }

  it("returns null when state or series is missing", () => {
    expect(
      resolveHighlightForSeries(null, pageSeries([101]), [101], queriesById),
    ).toBeNull();
    expect(
      resolveHighlightForSeries(commentState([101]), [], [101], queriesById),
    ).toBeNull();
  });

  it("sets the target cardId for a matching single-query chart", () => {
    expect(
      resolveHighlightForSeries(
        commentState([101]),
        pageSeries([101]),
        [101],
        queriesById,
      ),
    ).toEqual({
      columnName: "count",
      dimensions: [{ columnName: "category", value: "Gadget" }],
      cardId: 101,
      shouldShowTooltip: true,
    });
  });

  it("picks the matching series on a multi-series page", () => {
    expect(
      resolveHighlightForSeries(
        commentState([102]),
        pageSeries([101, 102]),
        [101, 102],
        queriesById,
      ),
    ).toEqual({
      columnName: "count",
      dimensions: [{ columnName: "category", value: "Gadget" }],
      cardId: 102,
      shouldShowTooltip: false,
    });
  });

  it("synthesizes a Series dimension for a composite embed", () => {
    expect(
      resolveHighlightForSeries(
        commentState([102]),
        embedSeries("bar", "Series"),
        [101, 102],
        queriesById,
      ),
    ).toEqual({
      columnName: "count",
      dimensions: [
        { columnName: "category", value: "Gadget" },
        { columnName: CARTESIAN_SERIES_COL_NAME, value: "EU" },
      ],
      cardId: 999,
      shouldShowTooltip: false,
    });
  });

  it("strips a Series dimension when resolving onto a page series", () => {
    expect(
      resolveHighlightForSeries(
        commentState([102], {
          columnName: "count",
          dimensions: [
            { columnName: "category", value: "Gadget" },
            { columnName: CARTESIAN_SERIES_COL_NAME, value: "EU" },
          ],
        }),
        pageSeries([101, 102]),
        [101, 102],
        queriesById,
      ),
    ).toEqual({
      columnName: "count",
      dimensions: [{ columnName: "category", value: "Gadget" }],
      cardId: 102,
      shouldShowTooltip: false,
    });
  });

  it("keeps a Segment dimension on a heatmap composite", () => {
    const highlighted: HighlightedObject = {
      columnName: "count",
      dimensions: [
        { columnName: "category", value: "Gadget" },
        { columnName: HEAT_MAP_SEGMENT_COL_NAME, value: "EU" },
      ],
    };

    expect(
      resolveHighlightForSeries(
        commentState([102], highlighted),
        embedSeries("table", "Segment"),
        [101, 102],
        queriesById,
      ),
    ).toEqual({
      columnName: "count",
      dimensions: highlighted.dimensions,
      cardId: 999,
      shouldShowTooltip: false,
    });
  });

  it("falls back to (All) when synthesizing without segment_name", () => {
    const noSegmentQueries = {
      101: makeQuery({ id: 101 }),
      102: makeQuery({ id: 102 }),
    };

    expect(
      resolveHighlightForSeries(
        commentState([101]),
        embedSeries("bar", "Series"),
        [101, 102],
        noSegmentQueries,
      )?.dimensions,
    ).toEqual([
      { columnName: "category", value: "Gadget" },
      { columnName: CARTESIAN_SERIES_COL_NAME, value: fallbackSegmentName() },
    ]);
  });

  it("returns null for a sibling map embed with a different query id", () => {
    expect(
      resolveHighlightForSeries(
        commentState([102]),
        pageSeries([999]),
        [101],
        queriesById,
      ),
    ).toBeNull();
  });

  it("returns null when composite synthesis cannot find the discriminator", () => {
    const noDiscriminator: SingleSeries[] = [
      {
        card: createMockCard({ id: 999, display: "bar" }),
        data: createMockDatasetData({
          cols: [categoryColumn, countColumn],
          rows: [["Gadget", 10]],
        }),
      },
    ];

    expect(
      resolveHighlightForSeries(
        commentState([102]),
        noDiscriminator,
        [101, 102],
        queriesById,
      ),
    ).toBeNull();
  });

  it("derives shouldShowTooltip from the target display", () => {
    const lineTarget = pageSeries([101]);
    const barTarget = [
      {
        card: createMockCard({ id: 101, display: "bar" }),
        data: createMockDatasetData({
          cols: [categoryColumn, countColumn],
          rows: [["Gadget", 10]],
        }),
      },
    ];

    expect(
      resolveHighlightForSeries(
        commentState([101]),
        lineTarget,
        [101],
        queriesById,
      )?.shouldShowTooltip,
    ).toBe(true);
    expect(
      resolveHighlightForSeries(
        commentState([101]),
        barTarget,
        [101],
        queriesById,
      )?.shouldShowTooltip,
    ).toBe(false);
  });
});

describe("comment highlight create ↔ resolve contract", () => {
  const categoryColumn = createMockColumn({
    name: "category",
    base_type: "type/Text",
    source: "breakout",
  });
  const countColumn = createMockColumn({
    name: "count",
    source: "aggregation",
  });
  const seriesColumn = createMockColumn({
    name: CARTESIAN_SERIES_COL_NAME,
    source: "breakout",
  });

  const queries = [
    makeQuery({ id: 101, segment_name: "US" }),
    makeQuery({ id: 102, segment_name: "EU" }),
  ];
  const queriesById = Object.fromEntries(queries.map((q) => [q.id, q]));
  const seriesQueryIds = [101, 102];

  function pageSeries(): SingleSeries[] {
    return seriesQueryIds.map((id) => ({
      card: createMockCard({ id, display: "line" }),
      data: createMockDatasetData({
        cols: [categoryColumn, countColumn],
        rows: [["Gadget", 10]],
      }),
    }));
  }

  function compositeEmbed(): SingleSeries[] {
    return [
      {
        card: createMockCard({ id: 999, display: "bar" }),
        data: createMockDatasetData({
          cols: [categoryColumn, countColumn, seriesColumn],
          rows: [["Gadget", 10, "EU"]],
        }),
      },
    ];
  }

  function toState(
    ctx: NonNullable<ReturnType<typeof buildCommentHighlightContext>>,
  ): HighlightedCommentState {
    return {
      childTargetId: "7",
      highlighted: ctx.highlighted,
      explorationQueryIds: ctx.exploration_query_ids,
    };
  }

  it("stores a single query id from a page click and resolves on the composite embed", () => {
    const clicked: ClickObject = {
      value: 10,
      column: countColumn,
      dimensions: [{ column: categoryColumn, value: "Gadget" }],
      settings: {},
      cardId: 102,
    };
    const ctx = buildCommentHighlightContext(
      clicked,
      seriesQueryIds,
      queriesById,
    );

    expect(ctx?.exploration_query_ids).toEqual([102]);
    expect(ctx?.highlighted.cardId).toBeUndefined();
    expect(ctx?.highlight_label).toBe("Gadget, EU");

    expect(
      resolveHighlightForSeries(
        toState(ctx!),
        compositeEmbed(),
        seriesQueryIds,
        queriesById,
      ),
    ).toEqual({
      columnName: "count",
      dimensions: [
        { columnName: "category", value: "Gadget" },
        { columnName: CARTESIAN_SERIES_COL_NAME, value: "EU" },
      ],
      cardId: 999,
      shouldShowTooltip: false,
    });
  });

  it("stores a single query id from a composite click and resolves on the page", () => {
    const clicked: ClickObject = {
      value: 10,
      column: countColumn,
      dimensions: [
        { column: categoryColumn, value: "Gadget" },
        { column: seriesColumn, value: "EU" },
      ],
      settings: {},
      cardId: 999,
    };
    const ctx = buildCommentHighlightContext(
      clicked,
      seriesQueryIds,
      queriesById,
    );

    expect(ctx?.exploration_query_ids).toEqual([102]);
    expect(ctx?.highlighted.cardId).toBeUndefined();

    expect(
      resolveHighlightForSeries(
        toState(ctx!),
        pageSeries(),
        seriesQueryIds,
        queriesById,
      ),
    ).toEqual({
      columnName: "count",
      dimensions: [{ columnName: "category", value: "Gadget" }],
      cardId: 102,
      shouldShowTooltip: false,
    });
  });

  it("stores the embed query id even when clicked.cardId is ephemeral", () => {
    const clicked: ClickObject = {
      value: 10,
      column: countColumn,
      dimensions: [{ column: categoryColumn, value: "Gadget" }],
      settings: {},
      cardId: 999,
    };
    const ctx = buildCommentHighlightContext(clicked, [101], {
      101: queriesById[101],
    });

    expect(ctx?.exploration_query_ids).toEqual([101]);
    expect(
      resolveHighlightForSeries(
        toState(ctx!),
        [
          {
            card: createMockCard({ id: 999, display: "line" }),
            data: createMockDatasetData({
              cols: [categoryColumn, countColumn],
              rows: [["Gadget", 10]],
            }),
          },
        ],
        [101],
        { 101: queriesById[101] },
      )?.cardId,
    ).toBe(999);
  });
});

describe("buildHighlightLabel", () => {
  const categoryColumn = createMockColumn({
    name: "category",
    base_type: "type/Text",
  });
  const tsColumn = createMockColumn({
    name: "ts",
    base_type: "type/DateTime",
    unit: "month",
  });
  const totalColumn = createMockColumn({
    name: "total",
    base_type: "type/Float",
    semantic_type: "type/Currency",
  });

  it("formats dimension values from the click", () => {
    const clicked: ClickObject = {
      value: 10,
      column: createMockColumn({ name: "count", source: "aggregation" }),
      dimensions: [{ column: categoryColumn, value: "Gadget" }],
      settings: {},
      cardId: 101,
    };

    expect(buildHighlightLabel(clicked)).toBe("Gadget");
  });

  it("formats through the chart's column settings, not the raw value", () => {
    const clicked: ClickObject = {
      value: 10,
      column: createMockColumn({ name: "count", source: "aggregation" }),
      dimensions: [{ column: totalColumn, value: 0 }],
      settings: {},
      cardId: 101,
    };

    // `buildHighlightLabel` only ever reaches for `.column`, so a stub of that one accessor stands
    // in for the ~100-key computed settings object a real chart would hand it.
    const settings = {
      column: () => ({
        column: totalColumn,
        currency: "USD",
        currency_style: "symbol",
        number_style: "currency",
      }),
    } as unknown as ComputedVisualizationSettings;

    // the bug this guards: without the settings the label is the bare "0" the server would derive
    expect(buildHighlightLabel(clicked, undefined)).toBe("0");
    expect(buildHighlightLabel(clicked, settings)).toBe("$0");
  });

  it("appends a segment name for multi-series pages", () => {
    const clicked: ClickObject = {
      value: 10,
      column: createMockColumn({ name: "count", source: "aggregation" }),
      dimensions: [{ column: categoryColumn, value: "Gadget" }],
      settings: {},
      cardId: 102,
    };

    expect(buildHighlightLabel(clicked, undefined, "EU")).toBe("Gadget, EU");
  });

  it("formats dates and null values", () => {
    expect(
      buildHighlightLabel({
        value: 10,
        column: createMockColumn({ name: "count" }),
        dimensions: [{ column: tsColumn, value: "2025-01-01T00:00:00Z" }],
        settings: {},
        cardId: 101,
      }),
    ).toMatch(/Jan/);

    expect(
      buildHighlightLabel({
        value: 10,
        column: createMockColumn({ name: "count" }),
        dimensions: [{ column: tsColumn, value: null }],
        settings: {},
        cardId: 101,
      }),
    ).toBe("(empty)");
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

  it("builds series and legend items for non-empty datasets only", () => {
    const emptyDataset = makeDataset([STATE_COL, COUNT_COL], []);
    const seriesGroup = buildSeriesGroup({
      queriesWithDatasets: [
        {
          ...makeQuery({ id: 1, segment_id: 1, segment_name: "US" }),
          dataset: emptyDataset,
        },
        {
          ...makeQuery({ id: 2, segment_id: 2, segment_name: "EU" }),
          dataset: stateDataset,
        },
      ],
    });

    expect(seriesGroup.series).toHaveLength(1);
    expect(seriesGroup.queryIds).toEqual([2]);
    expect(seriesGroup.legendItems.map((item) => item.name)).toEqual(["EU"]);
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

describe("composeChartsForGroup", () => {
  it("expands a multi-series map group into one entry per map", () => {
    const group = buildSeriesGroup({
      queriesWithDatasets: [
        {
          ...makeQuery({ id: 101, name: "US sessions", segment_id: 1 }),
          dataset: stateDataset,
        },
        {
          ...makeQuery({ id: 102, name: "EU sessions", segment_id: 2 }),
          dataset: stateDataset,
        },
        {
          ...makeQuery({ id: 103, name: "APAC sessions", segment_id: 3 }),
          dataset: stateDataset,
        },
      ],
    });

    const charts = composeChartsForGroup(group);

    expect(charts).toHaveLength(3);
    expect(charts.map((c) => c.queryIds)).toEqual([[101], [102], [103]]);
    expect(charts.map((c) => c.display)).toEqual(["map", "map", "map"]);
  });

  it("keeps a multi-series cartesian group as one composite entry", () => {
    const group = buildSeriesGroup({
      queriesWithDatasets: [
        {
          ...makeQuery({ id: 1, name: "Q1", segment_id: 1 }),
          dataset: tsDataset,
        },
        {
          ...makeQuery({ id: 2, name: "Q2", segment_id: 2 }),
          dataset: tsDataset,
        },
      ],
    });

    const charts = composeChartsForGroup(group);

    expect(charts).toHaveLength(1);
    expect(charts[0].queryIds).toEqual([1, 2]);
    expect(charts[0].display).toBe("line");
    expect(charts[0].visualization_settings["graph.dimensions"]).toEqual([
      "ts",
      "Series",
    ]);
  });

  it("keeps a single-series map as one entry", () => {
    const group = buildSeriesGroup({
      queriesWithDatasets: [
        {
          ...makeQuery({ id: 42, name: "World sessions" }),
          dataset: stateDataset,
        },
      ],
    });

    const charts = composeChartsForGroup(group);

    expect(charts).toHaveLength(1);
    expect(charts[0]).toMatchObject({
      queryIds: [42],
      display: "map",
    });
  });

  it("skips empty datasets when expanding multi-series maps", () => {
    const emptyDataset = makeDataset([STATE_COL, COUNT_COL], []);
    const group = buildSeriesGroup({
      queriesWithDatasets: [
        {
          ...makeQuery({ id: 1, name: "Empty", segment_id: 1 }),
          dataset: emptyDataset,
        },
        {
          ...makeQuery({ id: 2, name: "US", segment_id: 2 }),
          dataset: stateDataset,
        },
        {
          ...makeQuery({ id: 3, name: "EU", segment_id: 3 }),
          dataset: stateDataset,
        },
      ],
    });

    const charts = composeChartsForGroup(group);

    expect(charts).toHaveLength(2);
    expect(charts.map((c) => c.queryIds)).toEqual([[2], [3]]);
    expect(charts.map((c) => c.label)).toEqual(["US", "EU"]);
  });
});
