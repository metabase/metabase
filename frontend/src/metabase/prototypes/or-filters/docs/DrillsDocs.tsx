import type { ReactNode } from "react";
import { t } from "ttag";

import { Link } from "metabase/router";
import { Anchor, Code, List, Paper, Stack, Text, Title } from "metabase/ui";

import S from "./DrillsDocs.module.css";

type DocTableProps = {
  columns: string[];
  rows: ReactNode[][];
};

function DocTable({ columns, rows }: DocTableProps) {
  return (
    <table className={S.table}>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column}>{column}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((cells, rowIndex) => (
          <tr key={rowIndex}>
            {cells.map((cell, cellIndex) => (
              <td key={cellIndex}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type SectionProps = {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
};

function Section({ title, intro, children }: SectionProps) {
  return (
    <Stack gap="sm">
      <Title order={3}>{title}</Title>
      {intro && <Text c="text-secondary">{intro}</Text>}
      <Paper withBorder radius="md" p="md">
        {children}
      </Paper>
    </Stack>
  );
}

const SOURCE_STAGE_DRILLS: ReactNode[][] = [
  [
    "quick-filter",
    "cell of a non-aggregated, non-PK/FK column",
    <>
      appends one filter (<Code>= ≠ &lt; &gt;</Code>, contains, is empty) on the
      current stage
    </>,
  ],
  [
    "fk-filter",
    "FK cell",
    <>
      appends <Code>FK = value</Code> on the current stage (&ldquo;View this
      Product&rsquo;s Orders&rdquo;)
    </>,
  ],
  [
    "column-filter",
    "column header → FilterPicker",
    "user-picked filter on the current stage",
  ],
  [
    "pk / zoom (object detail)",
    "PK cell, or any cell in an unaggregated query",
    <>
      <Code>PK = value</Code>, opens object detail
    </>,
  ],
  [
    "fk-details",
    "FK cell",
    <>
      new query on the FK target table with <Code>PK = value</Code>
    </>,
  ],
  [
    "underlying-records",
    "aggregated cell / bar / point",
    <>
      drops aggregation, breakout, sort, limit, fields; adds one filter per
      breakout dimension (bin → <Code>&gt;= / &lt;</Code> range, bucketed date →
      bucketed <Code>=</Code>), plus the aggregation&rsquo;s own condition
      (count-where, sum-where, share, metric)
    </>,
  ],
  [
    "zoom-in.timeseries",
    "temporal-bucketed breakout",
    "filter on the clicked bucket, same breakout at the next finer unit",
  ],
  [
    "zoom-in.binning",
    <>
      numeric breakout with <Code>num-bins</Code> / <Code>bin-width</Code>
    </>,
    <>
      removes existing top-level <Code>&gt;= / &lt;</Code> filters on that
      column, adds the bin range, narrows the binning
    </>,
  ],
  [
    "zoom-in.geographic",
    "country / state / city or binned lat-lon breakout",
    "filter on clicked region, swaps breakout to lat-lon bins",
  ],
  [
    "pivot (Break out by…)",
    "aggregated cell, category / date / address breakouts only",
    <>
      one <Code>=</Code> filter per current breakout value, removes those
      breakouts, adds the chosen column as the new breakout
    </>,
  ],
  [
    "automatic-insights (X-ray)",
    "aggregated cell with breakouts",
    "opens X-ray, no query change",
  ],
];

const LATER_STAGE_DRILLS: ReactNode[][] = [
  [
    "quick-filter on an aggregation column",
    "aggregation column, query has breakouts",
    <>
      reuses the next stage if present, else appends one, filters there (
      <Code>Count &gt; 153</Code>)
    </>,
  ],
  ["column-filter on an aggregation column", "same", "same helper"],
  [
    "column-extract / combine-columns",
    "on an aggregation or breakout column, adding an expression",
    <>
      same helper with <Code>:expression</Code>; a breakout column also forces a
      new stage
    </>,
  ],
  [
    "sort on an aggregation column",
    "aggregated column",
    "order-by on the current stage, no new stage",
  ],
];

const SHAPE_CHANGING_DRILLS: ReactNode[][] = [
  [
    "summarize-column (sum / avg / distinct)",
    "unaggregated query",
    "adds the aggregation on the breakout stage",
  ],
  [
    "summarize-column-by-time",
    "unaggregated query, a date column available",
    <>
      adds <Code>sum</Code> plus a breakout on the first date column
    </>,
  ],
  [
    "distribution",
    "unaggregated, non-breakout column",
    <>
      replaces the stage with <Code>count</Code> by that column (bucketed or
      binned)
    </>,
  ],
  [
    "sort",
    "any orderable column",
    "replaces all order-bys with one on the column",
  ],
];

const PIVOT_AVAILABILITY: ReactNode[][] = [
  ["none", "category, location, time"],
  ["one date, optionally plus one category", "category, location"],
  ["one address", "category, time"],
  ["one or two categories", "category, time"],
  ["anything else (numeric bins, lat-lon bins, free text)", "none"],
];

const HARNESS_EXAMPLES: ReactNode[][] = [
  [
    "Quick filter, FK filter",
    "raw Orders table",
    "quick-filter on a cell; fk-filter on Product ID / User ID; column-filter on a header",
  ],
  [
    "See these Orders",
    "Count by Product → Category (bar)",
    <>
      underlying-records → <Code>Category = Gizmo</Code>; Break out by… also
      offered
    </>,
  ],
  [
    "See these Orders (count where)",
    "Count where Discount is not empty, by Category (bar)",
    <>
      underlying-records → <Code>Category = Doohickey</Code> and{" "}
      <Code>Discount is not empty</Code>, two pills in one click
    </>,
  ],
  [
    "Zoom in: time",
    "Count by Created At: Month (line)",
    <>
      zoom-in.timeseries → <Code>Created At is Jul 1–31, 2027</Code>, breakout
      becomes week
    </>,
  ],
  [
    "Zoom in: bins",
    "Count by Total, auto-binned (bar)",
    <>
      zoom-in.binning → <Code>Total &gt;= 40</Code> and{" "}
      <Code>Total &lt; 60</Code>, bins narrow
    </>,
  ],
  [
    "Zoom in: map",
    "Count by User → State (region map)",
    <>
      zoom-in.geographic → <Code>State is TX</Code>, result becomes a lat/lon
      grid map
    </>,
  ],
  [
    "Break out by…",
    "Count by User → Source (bar)",
    <>
      pivot → Category / Time → column list → <Code>Source is Affiliate</Code>,
      breakout swapped
    </>,
  ],
  [
    "Filter on Count",
    "Count by Product → Category (table)",
    <>
      quick-filter on a Count cell → <Code>Count &gt; 4939</Code> on the stage
      after the summary (Σ pill)
    </>,
  ],
];

/**
 * Reference page: every drill-through, what it writes into the query, and how
 * each one is reached from the harness examples. Mirrors `drills.md` in the
 * branch notes.
 */
export function DrillsDocs() {
  return (
    <Stack gap="xl" maw="72rem">
      <Stack gap="sm">
        <Title order={2}>{t`Drill-throughs`}</Title>
        <Text c="text-secondary">
          {t`A drill is a click on the results that narrows the question to what was clicked. Every filter-producing drill ends in a single appended clause, implicitly AND-ed with the rest of the stage; no drill knows about OR. That is why the directions here always AND a drilled filter against the whole existing expression, wrapping a top-level "or" in parentheses first.`}
        </Text>
        <Text c="text-secondary">
          {t`The prototype results run the real click-actions pipeline, limited to the drills that write a filter: quick-filter, fk-filter, column-filter, underlying-records, the three zoom-ins and pivot. Object detail, sort and X-ray are left out.`}
        </Text>
      </Stack>

      <Section
        title={t`Try them in the harness`}
        intro={
          <>
            {t`Each direction's canvas has a "Drill-throughs" example row: one unfiltered starting point per drill, and under each a button that loads the state the drill produces. Load a starting point, click the chart, apply the drill, and compare with the pre-built state.`}{" "}
            <Anchor component={Link} to="/prototypes/expression-bar-unified">
              {t`Open the one-bar direction`}
            </Anchor>
          </>
        }
      >
        <DocTable
          columns={[
            t`Example`,
            t`Starting query`,
            t`Drill → what lands in the bar`,
          ]}
          rows={HARNESS_EXAMPLES}
        />
      </Section>

      <Section
        title={t`Drills that filter on source-table data`}
        intro={t`These write on the breakout stage (stage 0), where the rows live.`}
      >
        <DocTable
          columns={[t`Drill`, t`Trigger`, t`Query change`]}
          rows={SOURCE_STAGE_DRILLS}
        />
      </Section>

      <Section
        title={t`Drills that operate on aggregated data`}
        intro={t`A filter on an aggregated value (Count > 120) needs a second stage, since MBQL has no HAVING. These write there.`}
      >
        <DocTable
          columns={[t`Drill`, t`Condition`, t`Mechanism`]}
          rows={LATER_STAGE_DRILLS}
        />
      </Section>

      <Section title={t`Drills that change the query shape`}>
        <DocTable
          columns={[t`Drill`, t`Condition`, t`Query change`]}
          rows={SHAPE_CHANGING_DRILLS}
        />
      </Section>

      <Section
        title={t`Pivot availability by breakout shape`}
        intro={t`"Break out by…" answers the follow-up question: within this bar, how does the metric vary by Y?`}
      >
        <DocTable
          columns={[t`Breakouts`, t`Pivot targets offered`]}
          rows={PIVOT_AVAILABILITY}
        />
      </Section>

      <Section title={t`Drill-through × OR filters`}>
        <List spacing="xs" size="sm">
          <List.Item>{t`A drill means "narrow to what I clicked", so it always ANDs against the whole existing expression. Widening ("also show Gizmo") is not a drill.`}</List.Item>
          <List.Item>{t`(Total > 100 or Tax > 2) plus a drill on Gizmo reads (Total > 100 or Tax > 2) and Category = Gizmo. Plain A and B plus a drill reads A and B and C, no parentheses.`}</List.Item>
          <List.Item>{t`Multi-clause drills (underlying-records on count-where, the bin range) append "and X and Y"; nothing special.`}</List.Item>
          <List.Item>{t`A drill is a committed action: it applies at once, the bar does not enter edit mode, and a draft in progress is dropped.`}</List.Item>
          <List.Item>{t`Quick-filter on an aggregated value lands on the stage after the summary; underlying-records and the zoom-ins filter breakout columns, which exist on the source, so they stay on stage 0.`}</List.Item>
          <List.Item>{t`zoom-in.binning removes existing top-level filters on its column only; one left inside parentheses goes stale. Known, out of scope.`}</List.Item>
        </List>
      </Section>
    </Stack>
  );
}
