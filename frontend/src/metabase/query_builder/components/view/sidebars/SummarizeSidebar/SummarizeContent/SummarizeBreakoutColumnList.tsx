import { t } from "ttag";

import { Box, Stack, Title } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { BreakoutColumnList } from "../BreakoutColumnList";

import { useBreakoutQuery } from "./use-summarize-query";

type SummarizeBreakoutColumnListProps = {
  query: Lib.Query;
  onQueryChange: (query: Lib.Query) => void;
};

export const SummarizeBreakoutColumnList = ({
  query: initialQuery,
  onQueryChange,
}: SummarizeBreakoutColumnListProps) => {
  const { hasAggregations } = useBreakoutQuery({
    query: initialQuery,
    onQueryChange,
  });

  return (
    hasAggregations && (
      <Stack data-testid="summarize-breakout-column-list" spacing="0" px="lg">
        <Title order={5}>{t`Group by`}</Title>
        <Box style={{ border: "1px solid blue" }}>
          <BreakoutColumnList
            query={initialQuery}
            onQueryChange={onQueryChange}
          />
        </Box>
      </Stack>
    )
  );
};
