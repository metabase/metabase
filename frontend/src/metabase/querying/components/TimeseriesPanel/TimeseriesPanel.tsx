import { useMemo } from "react";
import { t } from "ttag";
import { Group, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import { findBreakoutClause, findColumn } from "./utils";
import { TemporalBucketSelect } from "./TemporalBucketSelect";

interface TimeseriesPanelProps {
  query: Lib.Query;
  stageIndex: number;
  onChange: (query: Lib.Query) => void;
}

export function TimeseriesPanel({
  query,
  stageIndex,
  onChange,
}: TimeseriesPanelProps) {
  const column = useMemo(
    () => findColumn(query, stageIndex),
    [query, stageIndex],
  );

  const breakout = useMemo(
    () => column && findBreakoutClause(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const handleBreakoutChange = (newColumn: Lib.ColumnMetadata) => {
    if (breakout) {
      onChange(Lib.replaceClause(query, stageIndex, breakout, newColumn));
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
        stageIndex={stageIndex}
        column={column}
        onChange={handleBreakoutChange}
      />
    </Group>
  );
}
