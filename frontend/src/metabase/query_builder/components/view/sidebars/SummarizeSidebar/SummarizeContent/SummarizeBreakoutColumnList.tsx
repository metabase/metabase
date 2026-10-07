import { t } from "ttag";

import { Space, Stack, type StackProps, Title } from "metabase/ui";

import type { UpdateQueryHookProps } from "../../../../../hooks/types";
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
    gap="0"
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
