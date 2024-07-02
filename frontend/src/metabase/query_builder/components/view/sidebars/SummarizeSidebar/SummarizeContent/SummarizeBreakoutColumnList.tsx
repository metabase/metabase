import cx from "classnames";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Stack, type StackProps } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { BreakoutColumnList } from "../BreakoutColumnList";
import { SectionTitle } from "../SummarizeSidebar.styled";

type SummarizeBreakoutColumnListProps = {
  query: Lib.Query;
  onAddBreakout: (column: Lib.ColumnMetadata) => void;
  onUpdateBreakout: (
    clause: Lib.BreakoutClause,
    column: Lib.ColumnMetadata,
  ) => void;
  onRemoveBreakout: (column: Lib.ColumnMetadata) => void;
  onReplaceBreakouts: (column: Lib.ColumnMetadata) => void;
} & StackProps;

export const SummarizeBreakoutColumnList = ({
  query,
  onAddBreakout,
  onUpdateBreakout,
  onRemoveBreakout,
  onReplaceBreakouts,
  ...containerProps
}: SummarizeBreakoutColumnListProps) => (
  <Stack
    h="100%"
    spacing="0"
    className={cx(CS.flex1, CS.overflowYScroll)}
    {...containerProps}
  >
    <SectionTitle>{t`Group by`}</SectionTitle>
    <BreakoutColumnList
      query={query}
      onAddBreakout={onAddBreakout}
      onUpdateBreakout={onUpdateBreakout}
      onRemoveBreakout={onRemoveBreakout}
      onReplaceBreakout={onReplaceBreakouts}
    />
  </Stack>
);
