import { type ReactNode, useEffect, useState } from "react";
import { t } from "ttag";

import {
  Box,
  Button,
  Collapse,
  Group,
  Icon,
  Loader,
  Paper,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  Title,
  UnstyledButton,
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
import { DrillExamplesTable } from "./harness/DrillExamplesTable";
import { ExampleButton } from "./harness/ExampleButton";
import { FilterTreeInspector } from "./harness/FilterTreeInspector";
import { QueryResults } from "./harness/QueryResults";
import {
  clearFilters,
  withFilteredCountByCategoryByMonth,
  withFourLevelsExample,
  withTwoGroupsExample,
  withTwoStagesExample,
  withTwoSummariesExample,
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
  const [areDrillsOpen, setAreDrillsOpen] = useState(false);

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
                <Stack gap="xs">
                  <UnstyledButton
                    onClick={() => setAreDrillsOpen((open) => !open)}
                  >
                    <Group gap="xs">
                      <Icon
                        name={areDrillsOpen ? "chevrondown" : "chevronright"}
                        size={12}
                      />
                      <Text fw="bold" c="text-secondary">
                        {t`Drill-throughs`}
                      </Text>
                    </Group>
                  </UnstyledButton>
                  <Collapse in={areDrillsOpen}>
                    <DrillExamplesTable onLoad={loadExample} />
                  </Collapse>
                </Stack>
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

          {direction.Canvas && direction.NotebookCanvas && (
            <Stack gap="sm">
              <Title order={3}>{t`Notebook mode`}</Title>
              <direction.NotebookCanvas query={query} onChange={setQuery} />
            </Stack>
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
