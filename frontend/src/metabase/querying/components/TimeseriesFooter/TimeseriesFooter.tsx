import { useMemo } from "react";
import { t } from "ttag";
import { Group, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import { findBreakoutClause, findColumn } from "./utils";
import { TemporalBucketSelect } from "./TemporalBucketSelect";

const STAGE_INDEX = -1;

interface TimeseriesFooterProps {
  query: Lib.Query;
  updateQuery: (query: Lib.Query) => void;
}

export function TimeseriesFooter({
  query,
  updateQuery,
}: TimeseriesFooterProps) {
  const column = useMemo(() => findColumn(query, STAGE_INDEX), [query]);

  const breakout = useMemo(
    () => column && findBreakoutClause(query, STAGE_INDEX, column),
    [query, column],
  );

  const handleBreakoutChange = (newColumn: Lib.ColumnMetadata) => {
    if (breakout) {
      updateQuery(Lib.replaceClause(query, STAGE_INDEX, breakout, newColumn));
    }
  };

  if (!column) {
    return null;
  }

  return (
    <Group>
      <Text>{t`View by`}</Text>
      <TemporalBucketSelect
        query={query}
        stageIndex={STAGE_INDEX}
        column={column}
        onChange={handleBreakoutChange}
      />
    </Group>
  );
}
