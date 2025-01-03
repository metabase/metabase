import { t } from "ttag";

import type { UpdateQueryHookProps } from "metabase/query_builder/hooks/types";
import { Space, Stack, type StackProps, Title } from "metabase/ui";

import { BreakoutColumnList } from "../BreakoutColumnList";

type SummarizeBreakoutColumnListProps = UpdateQueryHookProps & StackProps;

export const SummarizeBreakoutColumnList = ({
  query,
  onQueryChange,
  stageIndex,
  ...containerProps
}: SummarizeBreakoutColumnListProps) => (
  <Stack
    data-testid="summarize-breakout-column-list"
    h="100%"
    spacing="0"
    {...containerProps}
  >
    <Title order={5} fw={900}>{t`Group by`}</Title>
    <Space my="sm" />
    <BreakoutColumnList
      query={query}
      onQueryChange={onQueryChange}
      stageIndex={stageIndex}
    />
  </Stack>
);
