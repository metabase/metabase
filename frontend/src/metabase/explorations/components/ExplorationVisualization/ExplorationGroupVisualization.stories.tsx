import { HttpResponse, http } from "msw";
import { useMemo } from "react";

import { getStore } from "__support__/entities-store";
import { TestWrapper } from "__support__/ui";
import { Api } from "metabase/api";
import {
  createGroup,
  createQuery,
  createThread,
} from "metabase/explorations/test-utils";
import { mainReducers } from "metabase/reducers-main";
import { createMockState } from "metabase/redux/store/mocks";
import { Stack, Text } from "metabase/ui";
import registerVisualizations from "metabase/visualizations/register";
import type {
  Dataset,
  DatasetColumn,
  ExplorationQuery,
  ExplorationQueryParams,
  ExplorationQueryType,
  RowValue,
  RowValues,
} from "metabase-types/api";

import { ExplorationGroupVisualization } from "./ExplorationGroupVisualization";

registerVisualizations();

function StoryWrapper({ children }: { children: React.ReactElement }) {
  const store = useMemo(
    () => getStore(mainReducers, createMockState(), [Api.middleware]),
    [],
  );
  return (
    <TestWrapper
      store={store}
      withRouter={false}
      withKBar={false}
      withDND
      withCssVariables
    >
      {children}
    </TestWrapper>
  );
}

export default {
  title: "Explorations/ExplorationGroupVisualization",
};

// ---------------------------------------------------------------------------
// Column factories
// ---------------------------------------------------------------------------

let nextColId = 1;

const TEMPORAL_FIELD_NAME = "CREATED_AT";

/** Monthly temporal breakout — matches BE default for timeseries exploration queries. */
function dateCol(overrides: Partial<DatasetColumn> = {}): DatasetColumn {
  const id = nextColId++;
  return {
    id,
    name: TEMPORAL_FIELD_NAME,
    display_name: "Created At: Month",
    base_type: "type/DateTime",
    effective_type: "type/DateTime",
    semantic_type: "type/CreationTimestamp",
    unit: "month",
    inherited_temporal_unit: "month",
    source: "breakout",
    field_ref: ["field", id, { "temporal-unit": "month" }],
    ...overrides,
  } as DatasetColumn;
}

function stringCol(
  name = "Category",
  overrides: Partial<DatasetColumn> = {},
): DatasetColumn {
  return {
    id: nextColId++,
    name,
    display_name: name,
    base_type: "type/Text",
    effective_type: "type/Text",
    semantic_type: "type/Category",
    source: "breakout",
    ...overrides,
  } as DatasetColumn;
}

function numberCol(
  name = "Count",
  overrides: Partial<DatasetColumn> = {},
): DatasetColumn {
  return {
    id: nextColId++,
    name,
    display_name: name,
    base_type: "type/Integer",
    effective_type: "type/Integer",
    semantic_type: null,
    source: "aggregation",
    ...overrides,
  } as DatasetColumn;
}

function boolCol(
  name = "Active",
  overrides: Partial<DatasetColumn> = {},
): DatasetColumn {
  return {
    id: nextColId++,
    name,
    display_name: name,
    base_type: "type/Boolean",
    effective_type: "type/Boolean",
    semantic_type: "type/Category",
    source: "breakout",
    ...overrides,
  } as DatasetColumn;
}

/** Integer extraction column — matches BE result metadata for temporal patterns. */
function temporalExtractionCol(
  unit: "day-of-week" | "hour-of-day",
  {
    name = TEMPORAL_FIELD_NAME,
    displayName = unit === "day-of-week"
      ? "Created At: Day of week"
      : "Created At: Hour of day",
    ...overrides
  }: Partial<DatasetColumn> & { displayName?: string } = {},
): DatasetColumn {
  const id = nextColId++;
  return {
    id,
    name,
    display_name: displayName,
    base_type: "type/Integer",
    effective_type: "type/Integer",
    semantic_type: "type/CreationTimestamp",
    unit,
    inherited_temporal_unit: unit,
    source: "breakout",
    field_ref: ["field", id, { "temporal-unit": unit }],
    ...overrides,
  } as DatasetColumn;
}

// ---------------------------------------------------------------------------
// Row generators — use seeded values instead of Math.random() so stories
// render the same data across hot-reloads.
// ---------------------------------------------------------------------------

function dateRange(count: number, start = "2024-01-01T00:00:00Z"): string[] {
  const dates: string[] = [];
  const d = new Date(start);
  for (let i = 0; i < count; i++) {
    // Month bucket starts — no time component in the formatted axis labels.
    dates.push(d.toISOString().replace("Z", "+00:00"));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return dates;
}

function timeseriesRows(count: number, seed = 0): RowValues[] {
  return dateRange(count).map((date, i) => [
    date,
    (i + 1) * (100 + seed * 20) + ((i * 17 + seed * 31) % 50),
  ]);
}

const TEMPORAL_PATTERN_METRIC_COL = numberCol("count", {
  display_name: "Count",
});

/**
 * Map JS `Date#getUTCDay()` (0 = Sunday) to MBQL day-of-week (1 = Monday … 7 = Sunday).
 * Labels on the chart axis come from the column's `unit`, not the raw integer.
 */
function metabaseDayOfWeek(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay;
}

function parseRowDate(value: RowValue): Date | null {
  if (value == null || typeof value !== "string") {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Derive day-of-week buckets from the dates present in a timeseries query. */
function dayOfWeekRowsFromTimeseries(timeseries: RowValues[]): RowValues[] {
  const maxRows = timeseries.length;
  if (maxRows === 0) {
    return [];
  }

  const seen = new Set<number>();
  const rows: RowValues[] = [];

  for (const row of timeseries) {
    const date = parseRowDate(row[0]);
    if (!date) {
      continue;
    }

    const jsDay = date.getUTCDay();
    const bucket = metabaseDayOfWeek(jsDay);
    if (seen.has(bucket)) {
      continue;
    }
    seen.add(bucket);

    const metric = typeof row[1] === "number" ? row[1] : 100;
    rows.push([bucket, Math.round(metric * (0.65 + ((jsDay * 0.05) % 0.3)))]);

    if (rows.length >= maxRows) {
      break;
    }
  }

  return rows.sort((a, b) => Number(a[0]) - Number(b[0]));
}

/** Derive hour-of-day buckets from a monthly timeseries query. */
function hourOfDayRowsFromTimeseries(timeseries: RowValues[]): RowValues[] {
  const maxRows = timeseries.length;
  if (maxRows === 0) {
    return [];
  }

  const seen = new Set<number>();
  const rows: RowValues[] = [];

  for (const [i, row] of timeseries.entries()) {
    // Monthly buckets are midnight — spread hours by row index for a realistic pattern.
    const hour = 8 + ((i * 5) % 12);
    if (seen.has(hour)) {
      continue;
    }
    seen.add(hour);

    const metric = typeof row[1] === "number" ? row[1] : 100;
    rows.push([hour, Math.round(metric * (0.55 + ((hour * 0.04) % 0.35)))]);

    if (rows.length >= maxRows) {
      break;
    }
  }

  return rows.sort((a, b) => Number(a[0]) - Number(b[0]));
}

function categoryRows(categories: string[]): RowValues[] {
  return categories.map((cat, i) => [cat, (i + 1) * 42 + ((i * 13) % 20)]);
}

function breakoutTimeseriesRows(
  breakoutValues: RowValue[],
  dateCount: number,
): RowValues[] {
  const dates = dateRange(dateCount);
  const rows: RowValues[] = [];
  for (const d of dates) {
    for (let bi = 0; bi < breakoutValues.length; bi++) {
      rows.push([breakoutValues[bi], d, 50 + (((bi + 1) * 37) % 200)]);
    }
  }
  return rows;
}

/**
 * Append a single aggregated null-bucket row, mirroring SQL GROUP BY behavior
 * when the breakout dimension is null. Position is pinned to the end for
 * deterministic story fixtures (real query order is warehouse-dependent).
 */
function appendNullBucket(
  rows: RowValues[],
  { column = 0, metric }: { column?: number; metric?: number } = {},
): RowValues[] {
  if (rows.length === 0) {
    return [[null, metric ?? 0]];
  }

  const rowLength = rows[0].length;
  const metricIndex = rowLength - 1;
  const metricValue =
    metric ??
    Math.round(
      rows.reduce(
        (sum, row) =>
          sum + (typeof row[metricIndex] === "number" ? row[metricIndex] : 0),
        0,
      ) / rows.length,
    );

  const nullRow: RowValues = Array.from(
    { length: rowLength },
    (_, colIndex) => {
      if (colIndex === column) {
        return null;
      }
      if (colIndex === metricIndex) {
        return metricValue;
      }
      return null;
    },
  );

  return [...rows, nullRow];
}

function breakoutValuesFromRows(rows: RowValues[], max = 8): RowValue[] {
  const seen = new Set<string>();
  const values: RowValue[] = [];
  for (const row of rows) {
    const value = row[0];
    const key = String(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    values.push(value);
    if (values.length >= max) {
      break;
    }
  }
  return values;
}

function topNRows(categories: string[], k: number): RowValues[] {
  const rows = categories
    .slice(0, k)
    .map((cat, i) => [cat, (k - i) * 100 + 15]);
  if (categories.length > k) {
    const otherTotal = categories
      .slice(k)
      .reduce((sum, _cat, i) => sum + 30 + ((i * 11) % 40), 0);
    rows.push(["(Other)", otherTotal]);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Scenario builder — constructs queries, datasets, MSW handlers, and the
// props needed to render ExplorationGroupVisualization.
// ---------------------------------------------------------------------------

let nextQueryId = 100;

interface QueryConfig {
  queryType?: ExplorationQueryType;
  cols: DatasetColumn[];
  rows: RowValues[];
  segmentId?: number | null;
  segmentName?: string | null;
  dimensionId?: string;
  params?: ExplorationQueryParams;
}

interface SegmentConfig {
  segmentId: number;
  segmentName: string;
  rows: RowValues[];
}

interface TimeSeriesScenarioOptions {
  dimensionId?: string;
  /** Day-of-week pattern — always emitted for temporal dims (default true). */
  includeDayPattern?: boolean;
  /** Hour-of-day pattern — emitted for DateTime dims only (default true). */
  includeHourPattern?: boolean;
  segments?: SegmentConfig[];
}

interface CategoryScenarioOptions {
  dimensionId?: string;
  /** Paired with default when cardinality ≤ 20 and metric has a temporal breakout. */
  includeTimeFacet?: boolean;
  timeFacetBreakouts?: RowValue[];
  timeFacetDateCount?: number;
  segments?: SegmentConfig[];
}

interface TopNScenarioOptions {
  dimensionId?: string;
  k?: number;
  /** When true, also include a default bar query (cardinality 21–100 band). */
  includeDefault?: boolean;
  segments?: SegmentConfig[];
}

const DEFAULT_DIMENSION_ID = "dim-1";

function temporalPatternConfigs(
  dimensionId: string,
  sourceRows: RowValues[],
  {
    includeDayPattern = true,
    includeHourPattern = true,
    segments = [],
  }: TimeSeriesScenarioOptions,
): QueryConfig[] {
  const configs: QueryConfig[] = [];

  if (includeDayPattern) {
    configs.push({
      queryType: "temporal-pattern-day",
      cols: [temporalExtractionCol("day-of-week"), TEMPORAL_PATTERN_METRIC_COL],
      rows: dayOfWeekRowsFromTimeseries(sourceRows),
      dimensionId,
    });
    for (const segment of segments) {
      configs.push({
        queryType: "temporal-pattern-day",
        cols: [
          temporalExtractionCol("day-of-week"),
          TEMPORAL_PATTERN_METRIC_COL,
        ],
        rows: dayOfWeekRowsFromTimeseries(segment.rows),
        dimensionId,
        segmentId: segment.segmentId,
        segmentName: segment.segmentName,
      });
    }
  }

  if (includeHourPattern) {
    configs.push({
      queryType: "temporal-pattern-hour",
      cols: [temporalExtractionCol("hour-of-day"), TEMPORAL_PATTERN_METRIC_COL],
      rows: hourOfDayRowsFromTimeseries(sourceRows),
      dimensionId,
    });
    for (const segment of segments) {
      configs.push({
        queryType: "temporal-pattern-hour",
        cols: [
          temporalExtractionCol("hour-of-day"),
          TEMPORAL_PATTERN_METRIC_COL,
        ],
        rows: hourOfDayRowsFromTimeseries(segment.rows),
        dimensionId,
        segmentId: segment.segmentId,
        segmentName: segment.segmentName,
      });
    }
  }

  return configs;
}

/**
 * Mirrors the backend mechanical plan for a DateTime temporal dim:
 * `default` (+ optional segments) with `temporal-pattern-day` and
 * `temporal-pattern-hour` in the same group.
 */
function buildTimeSeriesScenario(
  monthCount: number,
  options: TimeSeriesScenarioOptions = {},
): QueryConfig[] {
  const dimensionId = options.dimensionId ?? DEFAULT_DIMENSION_ID;
  const segments = options.segments ?? [];
  const mainRows = timeseriesRows(monthCount);

  const configs: QueryConfig[] = [
    {
      cols: [dateCol(), numberCol()],
      rows: mainRows,
      dimensionId,
    },
  ];

  for (const segment of segments) {
    configs.push({
      cols: [dateCol(), numberCol()],
      rows: segment.rows,
      dimensionId,
      segmentId: segment.segmentId,
      segmentName: segment.segmentName,
    });
  }

  configs.push(...temporalPatternConfigs(dimensionId, mainRows, options));

  return configs;
}

/**
 * Mirrors the backend mechanical plan for a low-cardinality categorical dim
 * when the metric has a temporal breakout: `default` + `time-facet`.
 */
function buildCategoryScenario(
  main: Pick<QueryConfig, "cols" | "rows">,
  options: CategoryScenarioOptions = {},
): QueryConfig[] {
  const dimensionId = options.dimensionId ?? DEFAULT_DIMENSION_ID;
  const segments = options.segments ?? [];
  const configs: QueryConfig[] = [{ ...main, dimensionId }];

  for (const segment of segments) {
    configs.push({
      ...main,
      rows: segment.rows,
      dimensionId,
      segmentId: segment.segmentId,
      segmentName: segment.segmentName,
    });
  }

  if (options.includeTimeFacet === false) {
    return configs;
  }

  const breakouts =
    options.timeFacetBreakouts ?? breakoutValuesFromRows(main.rows);
  configs.push({
    queryType: "time-facet",
    cols: [stringCol(main.cols[0]?.name ?? "Category"), dateCol(), numberCol()],
    rows: breakoutTimeseriesRows(breakouts, options.timeFacetDateCount ?? 8),
    dimensionId,
  });

  return configs;
}

/**
 * Mirrors `top-n-other` emission for high-cardinality categorical dims.
 * The BE uses this instead of (or alongside) `default` when distinct-count
 * is unknown or > 20; `default` is dropped entirely above 100.
 */
function buildTopNScenario(
  categories: string[],
  options: TopNScenarioOptions = {},
): QueryConfig[] {
  const dimensionId = options.dimensionId ?? DEFAULT_DIMENSION_ID;
  const k = options.k ?? 10;
  const segments = options.segments ?? [];
  const configs: QueryConfig[] = [];

  if (options.includeDefault) {
    configs.push({
      cols: [stringCol(), numberCol()],
      rows: categoryRows(categories),
      dimensionId,
    });
  }

  configs.push({
    queryType: "top-n-other",
    cols: [stringCol(), numberCol()],
    rows: topNRows(categories, k),
    dimensionId,
    params: { k },
  });

  for (const segment of segments) {
    configs.push({
      queryType: "top-n-other",
      cols: [stringCol(), numberCol()],
      rows: topNRows(categories, k),
      dimensionId,
      segmentId: segment.segmentId,
      segmentName: segment.segmentName,
      params: { k },
    });
  }

  return configs;
}

function buildScenario(configs: QueryConfig[]) {
  const queries: ExplorationQuery[] = [];
  const datasetsByQueryId = new Map<number, Dataset>();

  for (const cfg of configs) {
    const id = nextQueryId++;
    queries.push(
      createQuery({
        id,
        name: cfg.segmentName ?? "Query",
        status: "done",
        dimension_id: cfg.dimensionId ?? "dim-1",
        query_type: cfg.queryType ?? "default",
        segment_id: cfg.segmentId ?? null,
        segment_name: cfg.segmentName ?? null,
        params: cfg.params ?? null,
      }),
    );
    datasetsByQueryId.set(id, {
      data: { cols: cfg.cols, rows: cfg.rows },
      database_id: 1,
      row_count: cfg.rows.length,
      running_time: 100,
    } as Dataset);
  }

  const group = createGroup({
    id: "page-group-1",
    name: "Test Group",
    display_type: "page",
    query_ids: queries.map((q) => q.id),
  });

  const thread = createThread({
    queries,
    groups: [group],
  });

  const handlers = [
    http.get("*/api/exploration/query/:id", ({ params }) => {
      const id = Number(params.id);
      const dataset = datasetsByQueryId.get(id);
      if (dataset) {
        return HttpResponse.json(dataset);
      }
      return new HttpResponse(null, { status: 404 });
    }),
  ];

  return { queries, group, thread, handlers };
}

// ---------------------------------------------------------------------------
// Story shell — wraps the real component with VisualizationWrapper
// ---------------------------------------------------------------------------

function ScenarioStory({
  title,
  description,
  configs,
}: {
  title: string;
  description: string;
  configs: QueryConfig[];
}) {
  const { queries, group, thread, handlers } = buildScenario(configs);

  return {
    render: () => (
      <StoryWrapper>
        <Stack p="lg" gap="md" h="100vh">
          <div>
            <Text fw="bold" size="xl">
              {title}
            </Text>
            <Text c="text-secondary" size="sm">
              {description}
            </Text>
          </div>
          <ExplorationGroupVisualization
            explorationId={1}
            group={group}
            queries={queries}
            explorationThread={thread}
            availableTimelines={[]}
            selectedTimelineId={null}
            onSelectTimelineId={() => {}}
            locationSearch=""
          />
        </Stack>
      </StoryWrapper>
    ),
    parameters: { msw: { handlers } },
  };
}

// ===========================================================================
// STORIES
// ===========================================================================

// --- Time series (DateTime dim → default + day + hour patterns) ------------

export const Timeseries_Normal = ScenarioStory({
  title: "Time series — normal (12 months)",
  description:
    "Realistic group: main line chart + day-of-week and hour-of-day patterns below",
  configs: buildTimeSeriesScenario(12),
});

export const Timeseries_FewRows = ScenarioStory({
  title: "Time series — few rows (2 months)",
  description: "Main query has 2 data points → row chart fallback",
  configs: buildTimeSeriesScenario(2),
});

export const Timeseries_FewRowsWithSegment = ScenarioStory({
  title: "Time series — few rows with a segment",
  description: "Segments don't fallback to a row chart",
  configs: buildTimeSeriesScenario(2, {
    segments: [
      {
        segmentId: 1,
        segmentName: "VIP customers",
        rows: timeseriesRows(2, 1),
      },
    ],
  }),
});

export const Timeseries_SingleRow = ScenarioStory({
  title: "Time series — single row",
  description: "Main query has 1 data point → row chart fallback",
  configs: buildTimeSeriesScenario(1),
});

export const Timeseries_WithNulls = ScenarioStory({
  title: "Time series — null dimension values",
  description: "Time series shows warning, bar charts show '(empty)'",
  configs: buildTimeSeriesScenario(12).map((cfg) => {
    const shouldAppendNullBucket =
      cfg.queryType == null ||
      cfg.queryType === "temporal-pattern-day" ||
      cfg.queryType === "temporal-pattern-hour";

    return shouldAppendNullBucket
      ? { ...cfg, rows: appendNullBucket(cfg.rows) }
      : cfg;
  }),
});

// --- Time series with segments --------------------------------------------

export const Timeseries_WithSegment = ScenarioStory({
  title: "Time series — with a segment",
  description: "Time series stacked, temporal patterns bar",
  configs: buildTimeSeriesScenario(12, {
    segments: [
      {
        segmentId: 1,
        segmentName: "VIP customers",
        rows: timeseriesRows(12, 1),
      },
    ],
  }),
});

export const Timeseries_EmptySegment = ScenarioStory({
  title: "Time series — segment returns empty",
  description: "Don't display empty series if a segment returns empty",
  configs: buildTimeSeriesScenario(12, {
    segments: [{ segmentId: 1, segmentName: "Empty segment", rows: [] }],
  }),
});

export const Timeseries_With4Segments = ScenarioStory({
  title: "Time series — with 4 segments",
  description: "Time series stacked, temporal patterns heat map",
  configs: buildTimeSeriesScenario(12, {
    segments: [
      {
        segmentId: 1,
        segmentName: "Segment 1",
        rows: timeseriesRows(12, 1),
      },
      {
        segmentId: 2,
        segmentName: "Segment 2",
        rows: timeseriesRows(12, 2),
      },
      {
        segmentId: 3,
        segmentName: "Segment 3",
        rows: timeseriesRows(12, 3),
      },
      {
        segmentId: 4,
        segmentName: "Segment 4",
        rows: timeseriesRows(12, 4),
      },
    ],
  }),
});

export const Timeseries_With8Segments = ScenarioStory({
  title: "Time series — with 8 segments",
  description: "Time series not stacked, temporal patterns heat map",
  configs: buildTimeSeriesScenario(12, {
    segments: [
      {
        segmentId: 1,
        segmentName: "Segment 1",
        rows: timeseriesRows(12, 1),
      },
      {
        segmentId: 2,
        segmentName: "Segment 2",
        rows: timeseriesRows(12, 2),
      },
      {
        segmentId: 3,
        segmentName: "Segment 3",
        rows: timeseriesRows(12, 3),
      },
      {
        segmentId: 4,
        segmentName: "Segment 4",
        rows: timeseriesRows(12, 4),
      },
      {
        segmentId: 5,
        segmentName: "Segment 5",
        rows: timeseriesRows(12, 5),
      },
      {
        segmentId: 6,
        segmentName: "Segment 6",
        rows: timeseriesRows(12, 6),
      },
      {
        segmentId: 7,
        segmentName: "Segment 7",
        rows: timeseriesRows(12, 7),
      },
      {
        segmentId: 7,
        segmentName: "Segment 7",
        rows: timeseriesRows(12, 7),
      },
      {
        segmentId: 8,
        segmentName: "Segment 8",
        rows: timeseriesRows(12, 8),
      },
    ],
  }),
});

export const Timeseries_AllEmpty = ScenarioStory({
  title: "Time series — all queries return empty",
  description: "Every variant returns 0 rows → 'no data' empty state",
  configs: buildTimeSeriesScenario(12).map((cfg) => ({ ...cfg, rows: [] })),
});

// --- Bar chart (categorical dim → default + time-facet) ------------------

export const Bar_Normal = ScenarioStory({
  title: "Bar — string dimension (6 categories)",
  description:
    "Realistic group: bar chart on top, breakout-over-time line below",
  configs: buildCategoryScenario({
    cols: [stringCol(), numberCol()],
    rows: categoryRows([
      "Electronics",
      "Clothing",
      "Food",
      "Home",
      "Sports",
      "Books",
    ]),
  }),
});

export const Bar_FewRows = ScenarioStory({
  title: "Bar — few rows (2 categories)",
  description: "Main bar falls back to row chart; time-facet still renders",
  configs: buildCategoryScenario({
    cols: [stringCol(), numberCol()],
    rows: categoryRows(["Yes", "No"]),
  }),
});

export const Bar_FewRowsWithSegment = ScenarioStory({
  title: "Bar — few rows with a segment",
  description: "Segments don't fallback to a row chart",
  configs: buildCategoryScenario(
    {
      cols: [stringCol(), numberCol()],
      rows: categoryRows(["Yes", "No"]),
    },
    {
      segments: [
        {
          segmentId: 1,
          segmentName: "VIP customers",
          rows: [
            ["Yes", 10],
            ["No", 20],
          ],
        },
      ],
    },
  ),
});

export const Bar_Boolean = ScenarioStory({
  title: "Bar — boolean dimension",
  description: "Boolean breakout with default + time-facet companion",
  configs: buildCategoryScenario({
    cols: [boolCol(), numberCol()],
    rows: [
      ["true", 150],
      ["false", 85],
    ],
  }),
});

export const Bar_WithNulls = ScenarioStory({
  title: "Bar — with null dimension values",
  description: "Null displayed in bar and time-facet breakout",
  configs: buildCategoryScenario({
    cols: [stringCol(), numberCol()],
    rows: appendNullBucket(
      categoryRows(["Electronics", "Food", "Home", "Sports", "Books"]),
    ),
  }),
});

export const Bar_NullsFewRows = ScenarioStory({
  title: "Bar — nulls but few rows",
  description:
    "Null bucket + only 2 non-null rows → row chart fallback takes priority",
  configs: buildCategoryScenario({
    cols: [stringCol(), numberCol()],
    rows: appendNullBucket([
      ["A", 50],
      ["B", 100],
    ]),
  }),
});

// --- Time facet edge cases (via buildCategoryScenario options) ------------

export const TimeFacet_ManyBreakouts = ScenarioStory({
  title: "Time facet — 10 breakout values (no stack)",
  description:
    "More than 8 unique breakout values → line chart without split panels",
  configs: buildCategoryScenario(
    {
      cols: [stringCol(), numberCol()],
      rows: categoryRows(Array.from({ length: 10 }, (_, i) => `Cat ${i + 1}`)),
    },
    {
      timeFacetBreakouts: Array.from({ length: 10 }, (_, i) => `Cat ${i + 1}`),
      timeFacetDateCount: 6,
    },
  ),
});

export const TimeFacet_FewRows = ScenarioStory({
  title: "Time facet — few data points",
  description: "Breakout timeseries with only 2 dates → row chart fallback",
  configs: buildCategoryScenario(
    {
      cols: [stringCol(), numberCol()],
      rows: categoryRows(["Widget", "Gadget"]),
    },
    {
      timeFacetBreakouts: ["Widget", "Gadget"],
      timeFacetDateCount: 2,
    },
  ),
});

// --- Top-N-other (high-cardinality categorical dims) ----------------------

export const TopN_Only = ScenarioStory({
  title: "Top-N — high cardinality (top 10 only)",
  description:
    "Cardinality > 100: default is skipped; only the bounded top-n-other query runs",
  configs: buildTopNScenario(
    Array.from({ length: 150 }, (_, i) => `SKU-${i + 1}`),
    { k: 10 },
  ),
});

// --- Heatmap (many segments on default, no time-facet) --------------------

export const Heatmap_ManySegments = ScenarioStory({
  title: "Heatmap — 5 segments",
  description:
    "≥4 segment queries on default → table/heatmap; no time-facet (too busy)",
  configs: buildCategoryScenario(
    {
      cols: [stringCol(), numberCol()],
      rows: categoryRows(["A", "B", "C", "D", "E"]),
    },
    { includeTimeFacet: false },
  ).concat(
    ["Segment 1", "Segment 2", "Segment 3", "Segment 4"].map((name, i) => ({
      cols: [stringCol(), numberCol()],
      rows: categoryRows(["A", "B", "C", "D", "E"]).map(([cat, val]) => [
        cat,
        Math.round((val as number) * (0.5 + i * 0.2)),
      ]),
      segmentId: i + 1,
      segmentName: name,
      dimensionId: DEFAULT_DIMENSION_ID,
    })),
  ),
});
