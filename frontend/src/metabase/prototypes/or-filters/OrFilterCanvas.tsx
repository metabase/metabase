import { useEffect, useState } from "react";
import { t } from "ttag";

import {
  Box,
  Button,
  Group,
  Loader,
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
  withNestedExample,
  withOrExample,
  withPillsExample,
} from "./harness/examples";
import { useOrdersQuery } from "./harness/useOrdersQuery";
import type { FilterDirection } from "./types";

const STAGE_INDEX = 0;

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
    <Stack gap="lg">
      <Group justify="space-between">
        <Box>
          <Title order={3}>{direction.name}</Title>
          <Text c="text-secondary">{direction.description}</Text>
        </Box>
        <Group gap="xs">
          <Button
            size="compact-sm"
            variant="default"
            onClick={() => setQuery(withOrExample(query, STAGE_INDEX))}
          >
            {t`Load OR example`}
          </Button>
          <Button
            size="compact-sm"
            variant="default"
            onClick={() => setQuery(withDnfExample(query, STAGE_INDEX))}
          >
            {t`Load grouped example`}
          </Button>
          <Button
            size="compact-sm"
            variant="default"
            onClick={() => setQuery(withPillsExample(query, STAGE_INDEX))}
          >
            {t`Load two-pill example`}
          </Button>
          <Button
            size="compact-sm"
            variant="default"
            onClick={() => setQuery(withNestedExample(query, STAGE_INDEX))}
          >
            {t`Load nested example`}
          </Button>
          <Button
            size="compact-sm"
            variant="default"
            onClick={() => setQuery(clearFilters(query, STAGE_INDEX))}
          >
            {t`Clear filters`}
          </Button>
        </Group>
      </Group>

      <ChillFrame
        filterButton={
          direction.FilterButton && (
            <direction.FilterButton
              query={query}
              stageIndex={STAGE_INDEX}
              variant="chill"
              onChange={setQuery}
            />
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

      <NotebookFrame>
        <direction.Component
          query={query}
          stageIndex={STAGE_INDEX}
          variant="notebook"
          onChange={setQuery}
        />
      </NotebookFrame>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        <QueryResults query={query} stageIndex={STAGE_INDEX} />
        <FilterTreeInspector query={query} stageIndex={STAGE_INDEX} />
      </SimpleGrid>
    </Stack>
  );
}
