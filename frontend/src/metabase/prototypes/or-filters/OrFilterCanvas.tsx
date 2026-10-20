import { useEffect, useState } from "react";
import { t } from "ttag";

import {
  Box,
  Button,
  Group,
  Icon,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import type * as Lib from "metabase-lib";

import { ChillFrame } from "./frames/ChillFrame";
import { NotebookFrame } from "./frames/NotebookFrame";
import { FilterTreeInspector } from "./harness/FilterTreeInspector";
import { QueryResults } from "./harness/QueryResults";
import {
  clearFilters,
  withDnfExample,
  withFourLevelsExample,
  withNestedExample,
  withOrExample,
  withPillsExample,
  withTwoGroupsExample,
} from "./harness/examples";
import { useOrdersQuery } from "./harness/useOrdersQuery";
import type { FilterDirection } from "./types";

const STAGE_INDEX = 0;

type Example = {
  label: string;
  load: (query: Lib.Query, stageIndex: number) => Lib.Query;
};

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
];

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
  const [areFiltersHidden, setAreFiltersHidden] = useState(false);

  useEffect(() => {
    if (baseQuery && !query) {
      setQuery(baseQuery);
    }
  }, [baseQuery, query]);

  if (error) {
    return <Text c="feedback-negative">{error}</Text>;
  }
  if (!query) {
    return isLoading ? <Loader /> : null;
  }

  return (
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
              {EXAMPLES.map(({ label, load }) => (
                <Button
                  key={label}
                  size="sm"
                  variant="default"
                  onClick={() => setQuery(load(query, STAGE_INDEX))}
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
            </Group>
          </Stack>
        </Paper>
      </Stack>

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
        <NotebookFrame>
          <direction.Component
            query={query}
            stageIndex={STAGE_INDEX}
            variant="notebook"
            onChange={setQuery}
          />
        </NotebookFrame>
      </Stack>

      <Stack gap="sm">
        <Title order={3}>{t`Preview`}</Title>
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
          <Paper withBorder radius="md" p="lg" miw={0}>
            <QueryResults query={query} stageIndex={STAGE_INDEX} />
          </Paper>
          <Paper withBorder radius="md" p="lg" miw={0}>
            <FilterTreeInspector query={query} stageIndex={STAGE_INDEX} />
          </Paper>
        </SimpleGrid>
      </Stack>
    </Stack>
  );
}
