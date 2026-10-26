import { type ReactNode, useEffect, useState } from "react";
import { t } from "ttag";

import {
  Box,
  Button,
  Group,
  Icon,
  Loader,
  Paper,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  Title,
  Tooltip,
} from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { CardDisplayType } from "metabase-types/api";

import { CompactReadingContext } from "./directions/expression-bar-2/settings";
import {
  SummaryPlacementContext,
  CompactReadingContext as UnifiedCompactReadingContext,
} from "./directions/expression-bar-unified/settings";
import type { SummaryPlacement } from "./directions/expression-bar-unified/settings";
import { ChillFrame } from "./frames/ChillFrame";
import { NotebookFrame } from "./frames/NotebookFrame";
import { FilterTreeInspector } from "./harness/FilterTreeInspector";
import { QueryResults } from "./harness/QueryResults";
import {
  clearFilters,
  withCategoryMonthDrilled,
  withCountByBinnedTotal,
  withCountByCategory,
  withCountByCategoryByMonth,
  withCountByMonth,
  withCountBySource,
  withCountByState,
  withCountFilterDrilled,
  withCountWhereByCategory,
  withCountWhereDrilled,
  withFilteredCountByCategoryByMonth,
  withFkFilterDrilled,
  withFourLevelsExample,
  withPivotDrilled,
  withRawRows,
  withTwoGroupsExample,
  withTwoStagesExample,
  withTwoSummariesExample,
  withUnderlyingRecordsDrilled,
  withZoomBinsDrilled,
  withZoomMapDrilled,
  withZoomTimeDrilled,
} from "./harness/examples";
import { type SavedQuestion, getHeading } from "./harness/heading";
import { REALISTIC_EXAMPLES } from "./harness/realisticExamples";
import { useOrdersQuery } from "./harness/useOrdersQuery";
import type { Example, FilterDirection } from "./types";

const STAGE_INDEX = 0;

const DEFAULT_DISPLAY: CardDisplayType = "table";

const SYNTHETIC_SHAPE_EXAMPLES: Example[] = [
  {
    get label() {
      return t`(A and B) or (C and D)`;
    },
    load: withTwoGroupsExample,
  },
  {
    get label() {
      return t`A or (B and (C or (D and E)))`;
    },
    load: withFourLevelsExample,
  },
  {
    get label() {
      return t`Count by Category by Month, A or B`;
    },
    load: withFilteredCountByCategoryByMonth,
    display: "bar",
  },
  {
    get label() {
      return t`1 summary`;
    },
    load: withTwoStagesExample,
    display: "bar",
  },
  {
    get label() {
      return t`Two summaries`;
    },
    load: withTwoSummariesExample,
    display: "line",
    hint: t`Stage 0: Total > 100, Sum of Total by Created At: Day. Stage 1: Sum of Total > 500, then Average of Sum of Total by Created At: Month. Stage 2: Average of Sum of Total > 700. Three stages, a filter on each; the second summary re-buckets the day to months, since an aggregation's output cannot be binned.`,
  },
];

type DrillExample = {
  /** The unfiltered query shape on which the drill appears; the drill is performed in the results. */
  start: Example;
  /** The same query after the drill, built directly so it loads without a click. */
  drilled: Example;
};

/** One starting point and one drilled state per drill in `drills.md`. */
const DRILL_EXAMPLES: DrillExample[] = [
  {
    start: {
      get label() {
        return t`Quick filter, FK filter`;
      },
      load: withRawRows,
      hint: t`Orders as a table. Click a value → "=", "≠", "<", ">" or "Is empty"; click a Product ID → "View this Product's Orders" (Product ID = 14); click a header → filter picker.`,
    },
    drilled: {
      get label() {
        return t`Product ID = 14`;
      },
      load: withFkFilterDrilled,
      hint: t`After "View this Product's Orders" on a Product ID cell: one FK filter on the rows.`,
    },
  },
  {
    start: {
      get label() {
        return t`See these Orders`;
      },
      load: withCountByCategory,
      display: "bar",
      hint: t`Count by Product → Category. Click a bar → "See these Orders" writes Category = Gizmo; "Break out by…" is also offered.`,
    },
    drilled: {
      get label() {
        return t`Category = Gizmo`;
      },
      load: withUnderlyingRecordsDrilled,
      hint: t`After "See these Orders" on the Gizmo bar: aggregation and breakout dropped, one filter on the rows.`,
    },
  },
  {
    start: {
      get label() {
        return t`See these Orders (count where)`;
      },
      load: withCountWhereByCategory,
      display: "bar",
      hint: t`Count where Discount is not empty, by Product → Category. Click a bar → "See these Orders" writes two clauses: Category = Doohickey and Discount is not empty.`,
    },
    drilled: {
      get label() {
        return t`Doohickey, Discount not empty`;
      },
      load: withCountWhereDrilled,
      hint: t`After "See these Orders" on the Doohickey bar: the breakout value and the aggregation's own condition, two pills from one click.`,
    },
  },
  {
    start: {
      get label() {
        return t`Category × Month`;
      },
      load: withCountByCategoryByMonth,
      display: "bar",
      hint: t`Count by Product → Category by Created At: Month. Click a bar → "See these Orders" writes one filter per breakout: Category = Gizmo and Created At = March 2027 (month-bucketed). "Break out by…" writes the same two and swaps the breakouts.`,
    },
    drilled: {
      get label() {
        return t`Gizmo, Mar 2027`;
      },
      load: withCategoryMonthDrilled,
      hint: t`After "See these Orders" on the Gizmo × March 2027 bar: two pills from one click, one of them a bucketed date.`,
    },
  },
  {
    start: {
      get label() {
        return t`Zoom in: time`;
      },
      load: withCountByMonth,
      display: "line",
      hint: t`Count by Created At: Month. Click a point → "See this month by week" writes Created At = July 2027 and breaks out by week.`,
    },
    drilled: {
      get label() {
        return t`Jul 2027 by week`;
      },
      load: withZoomTimeDrilled,
      display: "line",
      hint: t`After "See this month by week" on July 2027: a month-bucketed "=" filter, breakout at the finer unit.`,
    },
  },
  {
    start: {
      get label() {
        return t`Zoom in: bins`;
      },
      load: withCountByBinnedTotal,
      display: "bar",
      hint: t`Count by Total in auto bins. Click a bar → "Zoom in" writes Total >= 40 and Total < 60 and narrows the bins. Existing top-level Total filters are removed first.`,
    },
    drilled: {
      get label() {
        return t`Total 40–60`;
      },
      load: withZoomBinsDrilled,
      display: "bar",
      hint: t`After "Zoom in" on the 40–60 bar: a ">=" and a "<" pill on the binned column, bins narrowed to that range.`,
    },
  },
  {
    start: {
      get label() {
        return t`Zoom in: map`;
      },
      load: withCountByState,
      display: "map",
      hint: t`Count by User → State on a region map. Click a state → "Zoom in: State" writes State = TX and swaps the breakout to binned latitude and longitude.`,
    },
    drilled: {
      get label() {
        return t`TX by lat/lon`;
      },
      load: withZoomMapDrilled,
      display: "map",
      hint: t`After "Zoom in: State" on Texas: State = TX, breakouts on latitude and longitude binned every 1°, drawn as a grid map.`,
    },
  },
  {
    start: {
      get label() {
        return t`Break out by…`;
      },
      load: withCountBySource,
      display: "bar",
      hint: t`Count by User → Source. Click a bar → "Break out by…" → Category or Time: writes Source = Affiliate, removes that breakout and adds the chosen column.`,
    },
    drilled: {
      get label() {
        return t`Affiliate by Category`;
      },
      load: withPivotDrilled,
      display: "bar",
      hint: t`After "Break out by… → Product → Category" on the Affiliate bar: Source = Affiliate on the rows, breakout swapped to Category.`,
    },
  },
  {
    start: {
      get label() {
        return t`Filter on Count`;
      },
      load: withCountByCategory,
      hint: t`Count by Product → Category as a table. Click a Count cell → ">" or "<" writes Count > 4939 on a new stage after the summary.`,
    },
    drilled: {
      get label() {
        return t`Count > 4939`;
      },
      load: withCountFilterDrilled,
      hint: t`After ">" on the Gadget Count cell: the filter sits on the stage after the summary, where the summary pill or zone shows it.`,
    },
  },
];

type ExampleButtonProps = {
  example: Example;
  onLoad: (example: Example) => void;
  leftSection?: ReactNode;
};

function ExampleButton({ example, onLoad, leftSection }: ExampleButtonProps) {
  return (
    <Tooltip
      label={example.hint}
      disabled={!example.hint}
      maw="24rem"
      multiline
      openDelay={300}
    >
      <Button
        size="sm"
        variant="default"
        leftSection={leftSection}
        onClick={() => onLoad(example)}
      >
        {example.label}
      </Button>
    </Tooltip>
  );
}

type DrillExamplePairsProps = {
  examples: DrillExample[];
  onLoad: (example: Example) => void;
};

/** One connected pair per drill, starting point then result, wrapping like a row of pills. */
function DrillExamplePairs({ examples, onLoad }: DrillExamplePairsProps) {
  return (
    <Group gap="sm" align="center">
      <Text fw="bold" c="text-secondary" miw="6.5rem">{t`Drill-throughs`}</Text>
      {examples.map(({ start, drilled }) => (
        <Button.Group key={start.label}>
          <ExampleButton example={start} onLoad={onLoad} />
          <ExampleButton
            example={drilled}
            onLoad={onLoad}
            leftSection={<Icon name="arrow_right" size={12} />}
          />
        </Button.Group>
      ))}
    </Group>
  );
}

type ExampleRowProps = {
  label: string;
  examples: Example[];
  onLoad: (example: Example) => void;
  children?: ReactNode;
};

function ExampleRow({ label, examples, onLoad, children }: ExampleRowProps) {
  return (
    <Group gap="sm" align="center">
      <Text fw="bold" c="text-secondary" miw="6.5rem">
        {label}
      </Text>
      {examples.map((example) => (
        <ExampleButton key={example.label} example={example} onLoad={onLoad} />
      ))}
      {children}
    </Group>
  );
}

/** Each expression-bar copy has its own settings context; the canvas feeds the right one. */
function getReadingContext(directionId: string) {
  switch (directionId) {
    case "expression-bar-unified":
    case "expression-bar-split":
    case "expression-bar-summary-menu":
      return UnifiedCompactReadingContext;
    default:
      return CompactReadingContext;
  }
}

type OrFilterCanvasProps = {
  direction: FilterDirection;
};

/**
 * Shared harness for the DSN-737 directions: Sample DB Orders as a Lib.Query
 * in local state, the direction's UI in a chill-mode strip and a notebook
 * step, live results, and a filter-tree inspector.
 */
export function OrFilterCanvas({ direction }: OrFilterCanvasProps) {
  const { query: baseQuery, isLoading, error } = useOrdersQuery();
  const [query, setQuery] = useState<Lib.Query>();
  const [display, setDisplay] = useState<CardDisplayType>(DEFAULT_DISPLAY);
  const [compactReading, setCompactReading] = useState(false);
  const [summaryPlacement, setSummaryPlacement] =
    useState<SummaryPlacement>("caret");
  const [saved, setSaved] = useState<SavedQuestion>();
  const [areFiltersHidden, setAreFiltersHidden] = useState(false);

  useEffect(() => {
    if (baseQuery && !query) {
      const { initialExample } = direction;
      if (initialExample) {
        const loaded = initialExample.load(baseQuery, STAGE_INDEX);
        setQuery(loaded);
        setSaved(
          initialExample.title
            ? { title: initialExample.title, query: loaded }
            : undefined,
        );
      } else {
        setQuery(direction.prepareQuery?.(baseQuery) ?? baseQuery);
      }
    }
  }, [baseQuery, query, direction]);

  if (error) {
    return <Text c="feedback-negative">{error}</Text>;
  }
  if (!query) {
    return isLoading ? <Loader /> : null;
  }

  const loadExample = ({ load, title, display: exampleDisplay }: Example) => {
    const loaded = load(baseQuery ?? query, STAGE_INDEX);
    setQuery(loaded);
    setSaved(title ? { title, query: loaded } : undefined);
    setDisplay(exampleDisplay ?? DEFAULT_DISPLAY);
  };
  const heading = getHeading(query, saved);

  const hasCompactReading =
    direction.id === "expression-bar-inline-2" ||
    direction.id === "expression-bar-unified" ||
    direction.id === "expression-bar-split" ||
    direction.id === "expression-bar-summary-menu";

  const hasSummaryPlacement = direction.id === "expression-bar-unified";

  const ReadingContext = getReadingContext(direction.id);

  return (
    <ReadingContext.Provider value={hasCompactReading && compactReading}>
      <SummaryPlacementContext.Provider value={summaryPlacement}>
        <Stack gap="xl">
          <Stack gap="sm">
            <Title order={3}>{direction.name}</Title>
            <Paper p="lg" radius="md">
              <Stack gap="lg">
                <Box>
                  <Text c="text-secondary">{direction.description}</Text>
                </Box>

                <ExampleRow
                  label={t`Realistic questions`}
                  examples={REALISTIC_EXAMPLES}
                  onLoad={loadExample}
                />
                <ExampleRow
                  label={t`Synthetic shapes`}
                  examples={SYNTHETIC_SHAPE_EXAMPLES}
                  onLoad={loadExample}
                >
                  <Button
                    ml="auto"
                    size="sm"
                    variant="subtle"
                    leftSection={<Icon name="close" />}
                    onClick={() => setQuery(clearFilters(query, STAGE_INDEX))}
                  >
                    {t`Clear filters`}
                  </Button>
                  <Button
                    size="sm"
                    variant="subtle"
                    leftSection={<Icon name="refresh" />}
                    disabled={!baseQuery}
                    onClick={() => {
                      if (baseQuery) {
                        setQuery(baseQuery);
                        setSaved(undefined);
                        setDisplay(DEFAULT_DISPLAY);
                      }
                    }}
                  >
                    {t`Reset`}
                  </Button>
                </ExampleRow>
                <DrillExamplePairs
                  examples={DRILL_EXAMPLES}
                  onLoad={loadExample}
                />
              </Stack>
            </Paper>
          </Stack>

          {hasCompactReading && (
            <Paper withBorder p="lg" radius="md">
              <Stack gap="sm">
                <Text fw="bold">{t`Prototype settings`}</Text>
                <Switch
                  label={t`Compact reading`}
                  checked={compactReading}
                  onChange={(event) =>
                    setCompactReading(event.currentTarget.checked)
                  }
                />
                <Text
                  size="sm"
                  c="text-secondary"
                >{t`Use shorter comparisons when reading filters. Editing shows the full labels.`}</Text>
                {hasSummaryPlacement && (
                  <>
                    <Text
                      fw="bold"
                      mt="sm"
                    >{t`Mixing summary and row filters`}</Text>
                    <SegmentedControl
                      w="fit-content"
                      value={summaryPlacement}
                      onChange={(value) =>
                        setSummaryPlacement(value === "end" ? "end" : "caret")
                      }
                      data={[
                        { value: "caret", label: t`Show an error` },
                        { value: "end", label: t`Move to the end` },
                      ]}
                    />
                    <Text size="sm" c="text-secondary">
                      {summaryPlacement === "caret"
                        ? t`A summary filter lands at the caret. A group that mixes it with row filters ("Count > 50 or Category = Gizmo") is an error on the offending pill.`
                        : t`A summary filter picked anywhere is carried to the end and AND-ed on, flashing where it lands, while the caret stays put.`}
                    </Text>
                  </>
                )}
              </Stack>
            </Paper>
          )}

          {direction.Canvas ? (
            <direction.Canvas
              query={query}
              onChange={setQuery}
              heading={heading}
            />
          ) : (
            <>
              <Stack gap="sm">
                <Title order={3}>{t`Chill mode`}</Title>
                <ChillFrame
                  heading={saved ? heading : undefined}
                  isHidden={direction.canHideFilters && areFiltersHidden}
                  filterButton={
                    direction.canHideFilters ? (
                      <Button
                        size="compact-md"
                        variant="default"
                        leftSection={<Icon name="filter" />}
                        onClick={() => setAreFiltersHidden((hidden) => !hidden)}
                      >
                        {areFiltersHidden ? t`Show filters` : t`Hide filters`}
                      </Button>
                    ) : (
                      direction.FilterButton && (
                        <direction.FilterButton
                          query={query}
                          stageIndex={STAGE_INDEX}
                          variant="chill"
                          onChange={setQuery}
                        />
                      )
                    )
                  }
                  results={
                    <QueryResults
                      query={query}
                      stageIndex={STAGE_INDEX}
                      display={display}
                      onChange={(nextQuery, nextDisplay) => {
                        setQuery(nextQuery);
                        setDisplay(nextDisplay);
                      }}
                    />
                  }
                >
                  <direction.Component
                    query={query}
                    stageIndex={STAGE_INDEX}
                    variant="chill"
                    onChange={setQuery}
                  />
                </ChillFrame>
              </Stack>

              <Stack gap="sm">
                <Title order={3}>{t`Notebook mode`}</Title>
                {direction.NotebookCanvas ? (
                  <direction.NotebookCanvas query={query} onChange={setQuery} />
                ) : (
                  <NotebookFrame>
                    <direction.Component
                      query={query}
                      stageIndex={STAGE_INDEX}
                      variant="notebook"
                      onChange={setQuery}
                    />
                  </NotebookFrame>
                )}
              </Stack>
            </>
          )}

          <Stack gap="sm">
            <Title order={3}>{t`Preview query`}</Title>
            <Paper withBorder radius="md" p="lg">
              <FilterTreeInspector query={query} stageIndex={STAGE_INDEX} />
            </Paper>
          </Stack>
        </Stack>
      </SummaryPlacementContext.Provider>
    </ReadingContext.Provider>
  );
}
