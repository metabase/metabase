import { t } from "ttag";

import { Box, Group, Stack, Title } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { AddAggregationButton } from "../AddAggregationButton";
import { AggregationItem } from "../AggregationItem";

import {
  type UseSummarizeQueryProps,
  useSummarizeQuery,
} from "./use-summarize-query";

type SummarizeAggregationItemListProps = {
  query: Lib.Query;
  onQueryChange: (query: Lib.Query) => void;
};

export const AggregationItemList = (props: UseSummarizeQueryProps) => {
  const { query, stageIndex, aggregations, handleAggregationChange } =
    useSummarizeQuery(props);

  return (
    <>
      {aggregations.map((aggregation, aggregationIndex) => (
        <AggregationItem
          key={aggregationIndex}
          query={query}
          stageIndex={stageIndex}
          aggregation={aggregation}
          aggregationIndex={aggregationIndex}
          onQueryChange={handleAggregationChange}
        />
      ))}

      <AddAggregationButton
        query={props.query}
        onQueryChange={props.onQueryChange}
      />
    </>
  );
};

export const SummarizeAggregationItemList = (
  props: SummarizeAggregationItemListProps,
) => (
  <Stack
    data-testid="summarize-breakout-column-list"
    spacing="0"
    px="lg"
    pt="lg"
  >
    <Title order={5}>{t`Summarize by`}</Title>
    <Group
      data-testid="summarize-aggregation-item-list"
      spacing="sm"
      align="flex-start"
    >
      <Box style={{ border: "1px solid red" }}>
        <AggregationItemList {...props} />
      </Box>
    </Group>
  </Stack>
);
