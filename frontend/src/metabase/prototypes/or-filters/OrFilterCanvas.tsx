import { type ReactNode, useEffect, useState } from "react";
import { t } from "ttag";

import {
  Box,
  Button,
  Group,
  Icon,
  Loader,
  Paper,
  Stack,
  Switch,
  Text,
  Title,
  Tooltip,
} from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { CardDisplayType } from "metabase-types/api";

import { CompactReadingContext } from "./directions/expression-bar-2/settings";
import { CompactReadingContext as UnifiedCompactReadingContext } from "./directions/expression-bar-unified/settings";
import { ChillFrame } from "./frames/ChillFrame";
import { NotebookFrame } from "./frames/NotebookFrame";
import { FilterTreeInspector } from "./harness/FilterTreeInspector";
import { QueryResults } from "./harness/QueryResults";
import {
  clearFilters,
  withCountByBinnedTotal,
  withCountByCategory,
  withCountByCategoryByMonth,
  withCountByMonth,
  withCountBySource,
  withCountByState,
  withCountWhereByCategory,
  withDnfExample,
  withFilteredCountByCategoryByMonth,
  withFourLevelsExample,
  withNestedExample,
  withOrExample,
  withPillsExample,
  withRawRows,
  withTwoGroupsExample,
  withTwoStagesExample,
} from "./harness/examples";
import { useOrdersQuery } from "./harness/useOrdersQuery";
import type { FilterDirection } from "./types";

const STAGE_INDEX = 0;

type Example = {
  label: string;
  load: (query: Lib.Query, stageIndex: number) => Lib.Query;
  /** How the results render once loaded; defaults to a table. */
  display?: CardDisplayType;
  /** What to click in the results and what the drill writes; shown as a tooltip. */
  hint?: string;
};

const DEFAULT_DISPLAY: CardDisplayType = "table";

const SYNTHETIC_SHAPE_EXAMPLES: Example[] = [
  {
    get label() {
      return t`A or B`;
    },
    load: withOrExample,
  },
  {
    get label() {
      return t`(A and B) or C`;
    },
    load: withDnfExample,
  },
  {
    get label() {
      return t`(A or B), C as two pills`;
    },
    load: withPillsExample,
  },
  {
    get label() {
      return t`(A and B) or (C and D)`;
    },
    load: withTwoGroupsExample,
  },
  {
    get label() {
      return t`A and B and (C or (D and E))`;
    },
    load: withNestedExample,
  },
  {
    get label() {
      return t`A or (B and (C or (D and E)))`;
    },
    load: withFourLevelsExample,
  },
  {
    get label() {
      return t`Count by Category by Month`;
    },
    load: withCountByCategoryByMonth,
    display: "bar",
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
      return t`Two stages, wraps`;
    },
    load: withTwoStagesExample,
    display: "bar",
  },
];

/** One unfiltered starting point per drill in `drills.md`; the drill is performed in the results. */
const DRILL_EXAMPLES: Example[] = [
  {
    get label() {
      return t`Quick filter, FK filter`;
    },
    load: withRawRows,
    hint: t`Orders as a table. Click a value → "=", "≠", "<", ">" or "Is empty"; click a Product ID → "View this Product's Orders" (Product ID = 42); click a header → filter picker.`,
  },
  {
    get label() {
      return t`See these Orders`;
    },
    load: withCountByCategory,
    display: "bar",
    hint: t`Count by Product → Category. Click a bar → "See these Orders" writes Category = Gizmo; "Break out by…" is also offered.`,
  },
  {
    get label() {
      return t`See these Orders (count where)`;
    },
    load: withCountWhereByCategory,
    display: "bar",
    hint: t`Count where Discount is not empty, by Product → Category. Click a bar → "See these Orders" writes two clauses: Category = Gizmo and Discount is not empty.`,
  },
  {
    get label() {
      return t`Zoom in: time`;
    },
    load: withCountByMonth,
    display: "line",
    hint: t`Count by Created At: Month. Click a point → "See this month by week" writes Created At = March 2024 and breaks out by week.`,
  },
  {
    get label() {
      return t`Zoom in: bins`;
    },
    load: withCountByBinnedTotal,
    display: "bar",
    hint: t`Count by Total in auto bins. Click a bar → "Zoom in" writes Total >= 20 and Total < 40 and narrows the bins. Existing top-level Total filters are removed first.`,
  },
  {
    get label() {
      return t`Zoom in: map`;
    },
    load: withCountByState,
    display: "map",
    hint: t`Count by User → State on a region map. Click a state → "Zoom in: State" writes State = CA and swaps the breakout to binned latitude and longitude.`,
  },
  {
    get label() {
      return t`Break out by…`;
    },
    load: withCountBySource,
    display: "bar",
    hint: t`Count by User → Source. Click a bar → "Break out by…" → Category or Time: writes Source = Affiliate, removes that breakout and adds the chosen column.`,
  },
  {
    get label() {
      return t`Filter on Count`;
    },
    load: withCountByCategory,
    hint: t`Count by Product → Category as a table. Click a Count cell → ">" or "<" writes Count > 153 on a new stage after the summary.`,
  },
];

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
        <Tooltip
          key={example.label}
          label={example.hint}
          disabled={!example.hint}
          maw="24rem"
          multiline
          openDelay={300}
        >
          <Button size="sm" variant="default" onClick={() => onLoad(example)}>
            {example.label}
          </Button>
        </Tooltip>
      ))}
      {children}
    </Group>
  );
}

/** Each expression-bar copy has its own settings context; the canvas feeds the right one. */
function getReadingContext(directionId: string) {
  switch (directionId) {
    case "expression-bar-unified":
    case "expression-bar-unified-tail":
    case "expression-bar-split":
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
  const [areFiltersHidden, setAreFiltersHidden] = useState(false);

  useEffect(() => {
    if (baseQuery && !query) {
      setQuery(direction.prepareQuery?.(baseQuery) ?? baseQuery);
    }
  }, [baseQuery, query, direction]);

  if (error) {
    return <Text c="feedback-negative">{error}</Text>;
  }
  if (!query) {
    return isLoading ? <Loader /> : null;
  }

  const loadExample = ({ load, display: exampleDisplay }: Example) => {
    setQuery(load(baseQuery ?? query, STAGE_INDEX));
    setDisplay(exampleDisplay ?? DEFAULT_DISPLAY);
  };

  const hasCompactReading =
    direction.id === "expression-bar-inline-2" ||
    direction.id === "expression-bar-unified" ||
    direction.id === "expression-bar-unified-tail" ||
    direction.id === "expression-bar-split";

  const ReadingContext = getReadingContext(direction.id);

  return (
    <ReadingContext.Provider value={hasCompactReading && compactReading}>
      <Stack gap="xl">
        <Stack gap="sm">
          <Title order={3}>{direction.name}</Title>
          <Paper p="lg" radius="md">
            <Stack gap="lg">
              <Box>
                <Text c="text-secondary">{direction.description}</Text>
              </Box>

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
                      setDisplay(DEFAULT_DISPLAY);
                    }
                  }}
                >
                  {t`Reset`}
                </Button>
              </ExampleRow>
              <ExampleRow
                label={t`Drill-throughs`}
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
            </Stack>
          </Paper>
        )}

        {direction.Canvas ? (
          <direction.Canvas query={query} onChange={setQuery} />
        ) : (
          <>
            <Stack gap="sm">
              <Title order={3}>{t`Chill mode`}</Title>
              <ChillFrame
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
    </ReadingContext.Provider>
  );
}
