import { useEffect, useState } from "react";
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
  withCountByCategoryByMonth,
  withDnfExample,
  withFilteredCountByCategoryByMonth,
  withFourLevelsExample,
  withNestedExample,
  withOrExample,
  withPillsExample,
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
};

const DEFAULT_DISPLAY: CardDisplayType = "table";

const EXAMPLES: Example[] = [
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

/** Each expression-bar copy has its own settings context; the canvas feeds the right one. */
function getReadingContext(directionId: string) {
  switch (directionId) {
    case "expression-bar-unified":
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

  const hasCompactReading =
    direction.id === "expression-bar-inline-2" ||
    direction.id === "expression-bar-unified";

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

              <Group gap="sm" align="center">
                <Text fw="bold" c="text-secondary">{t`Examples`}</Text>
                {EXAMPLES.map(({ label, load, display: exampleDisplay }) => (
                  <Button
                    key={label}
                    size="sm"
                    variant="default"
                    onClick={() => {
                      setQuery(load(baseQuery ?? query, STAGE_INDEX));
                      setDisplay(exampleDisplay ?? DEFAULT_DISPLAY);
                    }}
                  >
                    {label}
                  </Button>
                ))}
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
              </Group>
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
