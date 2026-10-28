import { t } from "ttag";

import { Code, Group, Stack, Text, Tooltip } from "metabase/ui";

import type { Example } from "../types";

import S from "./DocTable.module.css";
import { ExampleButton } from "./ExampleButton";
import {
  withCategoryMonthDrilled,
  withColumnFilterDrilled,
  withCountByBinnedTotal,
  withCountByCategory,
  withCountByCategoryByMonth,
  withCountByMonth,
  withCountBySource,
  withCountByState,
  withCountFilterDrilled,
  withCountWhereByCategory,
  withCountWhereDrilled,
  withCountWhereOrByCategory,
  withCountWhereOrDrilled,
  withFkFilterDrilled,
  withMonthCombined,
  withMonthExtracted,
  withOrExample,
  withPivotDrilled,
  withQuickFilterDrilled,
  withRawRows,
  withSortDrilled,
  withSumOfTotal,
  withSumOfTotalByMonth,
  withUnderlyingRecordsDrilled,
  withZoomBinsDrilled,
  withZoomMapDrilled,
  withZoomTimeDrilled,
} from "./examples";

type FilterTarget = "rows" | "summary" | "none";

type DrillRow = {
  /** The drill's type in `metabase.lib.drill-thru`, e.g. `fk-filter`. */
  drill: string;
  /** Distinguishes rows that exercise the same drill on different shapes. */
  variant?: string;
  /** Where the drill's filter lands; `none` when it writes no filter. */
  filter: FilterTarget;
  /** What the drill does to the query, in a few words. */
  queryChange: string;
  /** The unfiltered query the drill appears on; absent when no shape on Orders offers it. */
  start?: Example;
  /** The queries the drill produces; empty when it opens another view instead. */
  results: Example[];
  /** What to click in the results, then which popover item. */
  howToOpen: string;
  /** Set once the drill was tried from the "+ OR" start: whether it landed correctly next to the OR. */
  worksWithOr?: boolean;
  /** Why it breaks, when `worksWithOr` is false. */
  orFailure?: string;
};

type DrillGroup = {
  label: string;
  rows: DrillRow[];
};

const RAW_ROWS: Example = {
  get label() {
    return t`Orders`;
  },
  load: withRawRows,
};

const COUNT_BY_CATEGORY: Example = {
  get label() {
    return t`Count by Category`;
  },
  load: withCountByCategory,
  display: "bar",
};

/** Explicitly a table, so the chart-based directions show cells and headers to click. */
const COUNT_BY_CATEGORY_TABLE: Example = {
  get label() {
    return t`Count by Category`;
  },
  load: withCountByCategory,
  display: "table",
};

const COUNT_FILTERED_TABLE: Example = {
  get label() {
    return t`Count > 4939`;
  },
  load: withCountFilterDrilled,
  display: "table",
};

const MONTH_EXTRACTED: Example = {
  get label() {
    return t`Month of year`;
  },
  load: withMonthExtracted,
};

const FILTER_DRILLS: DrillRow[] = [
  {
    drill: "quick-filter",
    filter: "rows",
    get queryChange() {
      return t`Adds one filter on the clicked value`;
    },
    start: RAW_ROWS,
    results: [
      {
        get label() {
          return t`Total > 100`;
        },
        load: withQuickFilterDrilled,
      },
    ],
    get howToOpen() {
      return t`Click a Total cell → ">"`;
    },
    worksWithOr: true,
  },
  {
    drill: "quick-filter",
    get variant() {
      return t`on an aggregation`;
    },
    filter: "summary",
    get queryChange() {
      return t`Adds the filter on the stage after the summary`;
    },
    start: COUNT_BY_CATEGORY_TABLE,
    results: [COUNT_FILTERED_TABLE],
    get howToOpen() {
      return t`Click the Gadget Count cell → ">"; lands on the stage after the summary`;
    },
    worksWithOr: true,
  },
  {
    drill: "fk-filter",
    filter: "rows",
    get queryChange() {
      return t`Adds FK = value`;
    },
    start: RAW_ROWS,
    results: [
      {
        get label() {
          return t`Product ID = 14`;
        },
        load: withFkFilterDrilled,
      },
    ],
    get howToOpen() {
      return t`Click a Product ID cell → "View this Product's Orders"`;
    },
    worksWithOr: true,
  },
  {
    drill: "column-filter",
    filter: "rows",
    get queryChange() {
      return t`Adds the filter picked in the widget`;
    },
    start: RAW_ROWS,
    results: [
      {
        get label() {
          return t`Total 50–100`;
        },
        load: withColumnFilterDrilled,
      },
    ],
    get howToOpen() {
      return t`Click the Total header → "Filter by this column"`;
    },
    worksWithOr: true,
  },
  {
    drill: "column-filter",
    get variant() {
      return t`on an aggregation`;
    },
    filter: "summary",
    get queryChange() {
      return t`Adds the picked filter on the stage after the summary`;
    },
    start: COUNT_BY_CATEGORY_TABLE,
    results: [COUNT_FILTERED_TABLE],
    get howToOpen() {
      return t`Click the Count header → "Filter by this column"`;
    },
    worksWithOr: true,
  },
  {
    drill: "underlying-records",
    filter: "rows",
    get queryChange() {
      return t`Drops the summary, adds one filter per breakout value`;
    },
    start: COUNT_BY_CATEGORY,
    results: [
      {
        get label() {
          return t`Gizmo`;
        },
        load: withUnderlyingRecordsDrilled,
      },
    ],
    get howToOpen() {
      return t`Click the Gizmo bar → "See these Orders"`;
    },
    worksWithOr: true,
  },
  {
    drill: "underlying-records",
    get variant() {
      return t`count-where`;
    },
    filter: "rows",
    get queryChange() {
      return t`Drops the summary, adds the breakout value and the aggregation's own condition`;
    },
    start: {
      get label() {
        return t`Count where Discount by Category`;
      },
      load: withCountWhereByCategory,
      display: "bar",
    },
    results: [
      {
        get label() {
          return t`Doohickey, Discount not empty`;
        },
        load: withCountWhereDrilled,
      },
    ],
    get howToOpen() {
      return t`Click the Doohickey bar → "See these Orders"; the aggregation's own condition comes along`;
    },
    worksWithOr: true,
  },
  {
    drill: "underlying-records",
    get variant() {
      return t`count-where with an OR`;
    },
    filter: "rows",
    get queryChange() {
      return t`Drops the summary, adds the breakout value and the aggregation's OR condition as a group`;
    },
    start: {
      get label() {
        return t`Count where (Discount or Quantity) by Category`;
      },
      load: withCountWhereOrByCategory,
      display: "bar",
    },
    results: [
      {
        get label() {
          return t`Gizmo, (Discount not empty or Quantity > 3)`;
        },
        load: withCountWhereOrDrilled,
      },
    ],
    get howToOpen() {
      return t`Click the Gizmo bar → "See these Orders"; the drill writes an OR group the user never typed`;
    },
    worksWithOr: true,
  },
  {
    drill: "underlying-records",
    get variant() {
      return t`two breakouts`;
    },
    filter: "rows",
    get queryChange() {
      return t`Drops the summary, adds one filter per breakout value, the date one bucketed`;
    },
    start: {
      get label() {
        return t`Count by Category by Month`;
      },
      load: withCountByCategoryByMonth,
      display: "bar",
    },
    results: [
      {
        get label() {
          return t`Gizmo, Mar 2027`;
        },
        load: withCategoryMonthDrilled,
      },
    ],
    get howToOpen() {
      return t`Click a bar → "See these Orders"; one filter per breakout, the date one bucketed by month`;
    },
    worksWithOr: true,
  },
  {
    drill: "zoom-in.timeseries",
    filter: "rows",
    get queryChange() {
      return t`Adds a filter on the clicked bucket, breaks out again at the finer unit`;
    },
    start: {
      get label() {
        return t`Count by Month`;
      },
      load: withCountByMonth,
      display: "line",
    },
    results: [
      {
        get label() {
          return t`Jul 2027 by week`;
        },
        load: withZoomTimeDrilled,
        display: "line",
      },
    ],
    get howToOpen() {
      return t`Click a point → "See this month by week"`;
    },
  },
  {
    drill: "zoom-in.binning",
    filter: "rows",
    get queryChange() {
      return t`Adds a >= / < range on the column, narrows the bins`;
    },
    start: {
      get label() {
        return t`Count by Total`;
      },
      load: withCountByBinnedTotal,
      display: "bar",
    },
    results: [
      {
        get label() {
          return t`Total 40–60`;
        },
        load: withZoomBinsDrilled,
        display: "bar",
      },
    ],
    get howToOpen() {
      return t`Click the 40–60 bar → "Zoom in"`;
    },
    worksWithOr: false,
    get orFailure() {
      return t`Pre-existing query-processor bug, not caused by the drill or by GUI ORs: it is reachable today with a custom-expression filter like [Total] > 100 OR [Tax] > 2 on a binned breakout. The drill only removes top-level range filters on the column, so a range left inside the OR stays; binning then reads both the old and the new range as bounds, they don't overlap, the bin width comes out negative and the query fails. Fix: make the bounds extractor read only top-level AND-ed clauses.`;
    },
  },
  {
    drill: "zoom-in.geographic",
    filter: "rows",
    get queryChange() {
      return t`Adds a filter on the region, swaps the breakout to lat/lon bins`;
    },
    start: {
      get label() {
        return t`Count by State`;
      },
      load: withCountByState,
      display: "map",
    },
    results: [
      {
        get label() {
          return t`TX grid`;
        },
        load: withZoomMapDrilled,
        display: "map",
      },
    ],
    get howToOpen() {
      return t`Click Texas → "Zoom in: State"`;
    },
  },
  {
    drill: "pivot",
    filter: "rows",
    get queryChange() {
      return t`Adds = per breakout value, swaps the breakout for the chosen column`;
    },
    start: {
      get label() {
        return t`Count by Source`;
      },
      load: withCountBySource,
      display: "bar",
    },
    results: [
      {
        get label() {
          return t`Affiliate by Category`;
        },
        load: withPivotDrilled,
        display: "bar",
      },
    ],
    get howToOpen() {
      return t`Click the Affiliate bar → "Break out by…" → Product → Category`;
    },
  },
  {
    drill: "pk",
    get variant() {
      return t`multi-PK tables only`;
    },
    filter: "rows",
    get queryChange() {
      return t`Adds PK = value filters, then opens object detail`;
    },
    results: [],
    get howToOpen() {
      return t`Only on tables with several primary keys; never offered on Orders`;
    },
  },
  {
    drill: "fk-details",
    get variant() {
      return t`on a new query`;
    },
    filter: "rows",
    get queryChange() {
      return t`Replaces the query with one on the target table, ID = value`;
    },
    start: RAW_ROWS,
    results: [],
    get howToOpen() {
      return t`Click a Product ID cell → "View details"; the bar shows ID = 14 on Products`;
    },
  },
];

const OTHER_DRILLS: DrillRow[] = [
  {
    drill: "distribution",
    filter: "none",
    get queryChange() {
      return t`Replaces the summary with Count by the column`;
    },
    start: RAW_ROWS,
    results: [
      {
        get label() {
          return t`Count by Total`;
        },
        load: withCountByBinnedTotal,
        display: "bar",
      },
    ],
    get howToOpen() {
      return t`Click the Total header → "Distribution"`;
    },
  },
  {
    drill: "sort",
    filter: "none",
    get queryChange() {
      return t`Replaces every order-by with one on the column`;
    },
    start: RAW_ROWS,
    results: [
      {
        get label() {
          return t`Total ↓`;
        },
        load: withSortDrilled,
      },
    ],
    get howToOpen() {
      return t`Click the Total header → ↓`;
    },
  },
  {
    drill: "summarize-column",
    filter: "none",
    get queryChange() {
      return t`Adds an aggregation`;
    },
    start: RAW_ROWS,
    results: [
      {
        get label() {
          return t`Sum of Total`;
        },
        load: withSumOfTotal,
        display: "scalar",
      },
    ],
    get howToOpen() {
      return t`Click the Total header → "Sum" (also Avg, Distinct values)`;
    },
  },
  {
    drill: "summarize-column-by-time",
    filter: "none",
    get queryChange() {
      return t`Adds an aggregation and a date breakout`;
    },
    start: RAW_ROWS,
    results: [
      {
        get label() {
          return t`Sum of Total by Month`;
        },
        load: withSumOfTotalByMonth,
        display: "line",
      },
    ],
    get howToOpen() {
      return t`Click the Total header → "Sum over time"`;
    },
  },
  {
    drill: "column-extract",
    filter: "none",
    get queryChange() {
      return t`Adds an expression column`;
    },
    start: RAW_ROWS,
    results: [MONTH_EXTRACTED],
    get howToOpen() {
      return t`Click the Created At header → "Extract part of column" → "Month of year"`;
    },
  },
  {
    drill: "combine-columns",
    filter: "none",
    get queryChange() {
      return t`Adds a concat expression column`;
    },
    start: MONTH_EXTRACTED,
    results: [
      {
        get label() {
          return t`Month + Quantity`;
        },
        load: withMonthCombined,
      },
    ],
    get howToOpen() {
      return t`Click the Month of year header → "Combine columns" → add Quantity; Orders has no text column of its own`;
    },
  },
  {
    drill: "zoom",
    filter: "none",
    get queryChange() {
      return t`No change; navigates to object detail`;
    },
    results: [],
    get howToOpen() {
      return t`Not reachable here: an ID cell has no popover at all, since quick filters skip primary keys and the real app's "View details" is a page navigation the harness does not wire up`;
    },
  },
  {
    drill: "automatic-insights",
    filter: "none",
    get queryChange() {
      return t`No change; navigates to an X-ray dashboard`;
    },
    start: COUNT_BY_CATEGORY,
    results: [],
    get howToOpen() {
      return t`Click a bar → "Automatic insights…" → "X-ray"; leaves the prototype for an auto dashboard`;
    },
  },
];

const GROUPS: DrillGroup[] = [
  {
    get label() {
      return t`Writes a filter`;
    },
    rows: FILTER_DRILLS,
  },
  {
    get label() {
      return t`Writes no filter`;
    },
    rows: OTHER_DRILLS,
  },
];

const SUMMARY_MARK = (
  <Text component="span" fw="bold" c="core-summarize" ml="xs">
    Σ
  </Text>
);

type OrCheckMarkProps = Pick<DrillRow, "worksWithOr" | "orFailure">;

function OrCheckMark({ worksWithOr, orFailure }: OrCheckMarkProps) {
  if (worksWithOr === undefined) {
    return (
      <Text component="span" c="text-secondary">
        —
      </Text>
    );
  }
  if (worksWithOr) {
    return (
      <Text
        component="span"
        title={t`Tried from the + OR start; lands AND-ed next to the OR`}
      >
        ✅
      </Text>
    );
  }
  return (
    <Tooltip label={orFailure} multiline maw="24rem">
      <Text component="span">🟠</Text>
    </Tooltip>
  );
}

function FilterMark({ target }: { target: FilterTarget }) {
  switch (target) {
    case "rows":
      return <>✅</>;
    case "summary":
      return <>✅{SUMMARY_MARK}</>;
    case "none":
      return <>⛔</>;
  }
}

/** The same starting point with `Total > 100 or Tax > 2` on the rows, to see the drill land next to an OR. */
function withOrStart(start: Example): Example {
  return {
    ...start,
    get label() {
      return t`${start.label} + OR`;
    },
    load: (query, stageIndex) =>
      withOrExample(start.load(query, stageIndex), stageIndex),
    hint: t`Same shape, with (Total > 100 or Tax > 2) already on the rows`,
  };
}

type DrillExamplesTableProps = {
  onLoad: (example: Example) => void;
};

/**
 * Every drill-through: whether it writes a filter, a button that loads the
 * unfiltered query it appears on, buttons that load what it produces, and
 * where to click to trigger it for real.
 */
export function DrillExamplesTable({ onLoad }: DrillExamplesTableProps) {
  return (
    <Stack gap="xs">
      <table className={S.table}>
        <thead>
          <tr>
            <th>{t`Drill`}</th>
            <th>{t`Filter`}</th>
            <th>{t`Query change`}</th>
            <th>{t`With OR`}</th>
            <th>{t`Start`}</th>
            <th>{t`Result`}</th>
            <th>{t`How to open`}</th>
          </tr>
        </thead>
        {GROUPS.map((group) => (
          <tbody key={group.label}>
            <tr>
              <th colSpan={7} className={S.groupHeading}>
                {group.label}
              </th>
            </tr>
            {group.rows.map((row) => (
              <tr key={`${row.drill}-${row.variant ?? ""}`}>
                <td>
                  <Code>{row.drill}</Code>
                  {row.variant && (
                    <Text size="xs" c="text-secondary">
                      {row.variant}
                    </Text>
                  )}
                </td>
                <td>
                  <FilterMark target={row.filter} />
                </td>
                <td>
                  <Text size="sm">{row.queryChange}</Text>
                </td>
                <td>
                  <OrCheckMark
                    worksWithOr={row.worksWithOr}
                    orFailure={row.orFailure}
                  />
                </td>
                <td>
                  {row.start ? (
                    <Group gap="xs">
                      <ExampleButton example={row.start} onLoad={onLoad} />
                      <ExampleButton
                        example={withOrStart(row.start)}
                        onLoad={onLoad}
                      />
                    </Group>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  {row.results.length > 0 ? (
                    <Group gap="xs">
                      {row.results.map((result) => (
                        <ExampleButton
                          key={result.label}
                          example={result}
                          onLoad={onLoad}
                        />
                      ))}
                    </Group>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <Text size="sm" c="text-secondary">
                    {row.howToOpen}
                  </Text>
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
      <Group gap="xs">
        <Text size="xs" c="text-secondary">{t`✅ filter on the rows`}</Text>
        <Text size="xs" c="text-secondary">
          <FilterMark target="summary" />{" "}
          {t`filter on the stage after the summary`}
        </Text>
        <Text size="xs" c="text-secondary">{t`⛔ no filter`}</Text>
        <Text size="xs" c="text-secondary">
          {t`+ OR: the same start with (Total > 100 or Tax > 2) on the rows`}
        </Text>
        <Text size="xs" c="text-secondary">
          {t`With OR ✅: tried from the + OR start, the drill lands AND-ed next to the OR; 🟠 breaks on a pre-existing bug, hover for why; — not tried yet`}
        </Text>
      </Group>
    </Stack>
  );
}
