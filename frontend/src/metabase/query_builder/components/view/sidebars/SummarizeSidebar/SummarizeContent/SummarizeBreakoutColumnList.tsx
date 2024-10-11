import { t } from "ttag";

import { Stack, type StackProps } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { BreakoutColumnList } from "../BreakoutColumnList";
import { SectionTitle } from "../SummarizeSidebar.styled";

type SummarizeBreakoutColumnListProps = {
  query: Lib.Query;
  stageIndex: number;
  onAddBreakout: (column: Lib.ColumnMetadata) => void;
  onUpdateBreakout: (
    clause: Lib.BreakoutClause,
    column: Lib.ColumnMetadata,
  ) => void;
  onRemoveBreakout: (clause: Lib.BreakoutClause) => void;
  onReplaceBreakouts: (column: Lib.ColumnMetadata) => void;
} & StackProps;

export const SummarizeBreakoutColumnList = ({
  query,
  stageIndex,
  onAddBreakout,
  onUpdateBreakout,
  onRemoveBreakout,
  onReplaceBreakouts,
  ...containerProps
}: SummarizeBreakoutColumnListProps) => (
  <Stack
    data-testid="summarize-breakout-column-list"
    h="100%"
    gap="0"
    {...containerProps}
  >
    <SectionTitle>{t`Group by`}</SectionTitle>
    <BreakoutColumnList
      query={query}
      stageIndex={stageIndex}
      onAddBreakout={onAddBreakout}
      onUpdateBreakout={onUpdateBreakout}
      onRemoveBreakout={onRemoveBreakout}
      onReplaceBreakouts={onReplaceBreakouts}
    />
  </Stack>
);
