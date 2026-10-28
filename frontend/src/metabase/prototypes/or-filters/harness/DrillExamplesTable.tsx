import { t } from "ttag";

import { Code, Group, Stack, Text } from "metabase/ui";

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
  withFkFilterDrilled,
  withMonthCombined,
  withMonthExtracted,
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

type DrillRow = {
  /** The drill's type in `metabase.lib.drill-thru`, e.g. `fk-filter`. */
  drill: string;
  /** Distinguishes rows that exercise the same drill on different shapes. */
  variant?: string;
  writesFilter: boolean;
  /** What the drill does to the query, in a few words. */
  queryChange: string;
  /** Index into `FOOTNOTES`, for the two drills whose filter is not on this query. */
  footnote?: number;
  /** The unfiltered query the drill appears on; absent when no shape on Orders offers it. */
  start?: Example;
  /** The queries the drill produces; empty when it opens another view instead. */
  results: Example[];
  /** What to click in the results, then which popover item. */
  howToOpen: string;
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

const MONTH_EXTRACTED: Example = {
  get label() {
    return t`Month of year`;
  },
  load: withMonthExtracted,
};

const FILTER_DRILLS: DrillRow[] = [
  {
    drill: "quick-filter",
    writesFilter: true,
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
  },
  {
    drill: "quick-filter",
    get variant() {
      return t`on an aggregation`;
    },
    writesFilter: true,
    get queryChange() {
      return t`Adds the filter on the stage after the summary`;
    },
    start: {
      get label() {
        return t`Count by Category`;
      },
      load: withCountByCategory,
    },
    results: [
      {
        get label() {
          return t`Count > 4939`;
        },
        load: withCountFilterDrilled,
      },
    ],
    get howToOpen() {
      return t`Click the Gadget Count cell → ">"; lands on the stage after the summary`;
    },
  },
  {
    drill: "fk-filter",
    writesFilter: true,
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
  },
  {
    drill: "column-filter",
    writesFilter: true,
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
  },
  {
    drill: "underlying-records",
    writesFilter: true,
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
  },
  {
    drill: "underlying-records",
    get variant() {
      return t`count-where`;
    },
    writesFilter: true,
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
  },
  {
    drill: "underlying-records",
    get variant() {
      return t`two breakouts`;
    },
    writesFilter: true,
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
  },
  {
    drill: "zoom-in.timeseries",
    writesFilter: true,
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
    writesFilter: true,
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
  },
  {
    drill: "zoom-in.geographic",
    writesFilter: true,
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
    writesFilter: true,
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
];

const OTHER_DRILLS: DrillRow[] = [
  {
    drill: "distribution",
    writesFilter: false,
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
    writesFilter: false,
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
    writesFilter: false,
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
    writesFilter: false,
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
    writesFilter: false,
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
    writesFilter: false,
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
    drill: "pk",
    writesFilter: false,
    get queryChange() {
      return t`Adds PK = value filters, then opens object detail`;
    },
    footnote: 1,
    results: [],
    get howToOpen() {
      return t`Only on tables with several primary keys; never offered on Orders`;
    },
  },
  {
    drill: "zoom",
    writesFilter: false,
    get queryChange() {
      return t`No change; navigates to object detail`;
    },
    start: RAW_ROWS,
    results: [],
    get howToOpen() {
      return t`Click an ID cell → "View details"; navigates to object detail in the real app, does nothing here`;
    },
  },
  {
    drill: "fk-details",
    writesFilter: false,
    get queryChange() {
      return t`New query on the target table with ID = value`;
    },
    footnote: 2,
    start: RAW_ROWS,
    results: [],
    get howToOpen() {
      return t`Click a Product ID cell → "View details"; loads Products with ID = 14`;
    },
  },
  {
    drill: "automatic-insights",
    writesFilter: false,
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
      return t`Writes a filter on this query`;
    },
    rows: FILTER_DRILLS,
  },
  {
    get label() {
      return t`Changes the query's shape or opens another view`;
    },
    rows: OTHER_DRILLS,
  },
];

const FOOTNOTES = [
  t`pk writes "PK = value", but only on tables with several primary keys.`,
  t`fk-details writes "ID = value" on a new query on the target table.`,
];

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
            <th>{t`Start`}</th>
            <th>{t`Result`}</th>
            <th>{t`How to open`}</th>
          </tr>
        </thead>
        {GROUPS.map((group) => (
          <tbody key={group.label}>
            <tr>
              <th colSpan={6} className={S.groupHeading}>
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
                  {row.writesFilter ? "✅" : "⛔"}
                  {row.footnote && <sup>{row.footnote}</sup>}
                </td>
                <td>
                  <Text size="sm">{row.queryChange}</Text>
                </td>
                <td>
                  {row.start ? (
                    <ExampleButton example={row.start} onLoad={onLoad} />
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
      {FOOTNOTES.map((note, index) => (
        <Text key={index} size="xs" c="text-secondary">
          <sup>{index + 1}</sup> {note}
        </Text>
      ))}
    </Stack>
  );
}
