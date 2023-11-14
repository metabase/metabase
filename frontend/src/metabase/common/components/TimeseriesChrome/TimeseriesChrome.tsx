import { useMemo } from "react";
import { t } from "ttag";
import { Group, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/Question";
import { TemporalFilterSelect } from "./TemporalFilterSelect";
import { TemporalBucketSelect } from "./TemporalBucketSelect";
import {
  findBreakoutClause,
  findBreakoutColumn,
  findFilterClause,
  findFilterColumn,
} from "./utils";

const STAGE_INDEX = -1;

interface UpdateQuestionOpts {
  run?: boolean;
}

interface TimeseriesChromeProps {
  question: Question;
  updateQuestion: (newQuestion: Question, opts?: UpdateQuestionOpts) => void;
}

export function TimeseriesChrome({
  question,
  updateQuestion,
}: TimeseriesChromeProps) {
  const query = question._getMLv2Query();

  const handleChange = (query: Lib.Query) => {
    updateQuestion(question._setMLv2Query(query), { run: true });
  };

  return (
    <TimeseriesControls
      query={query}
      stageIndex={STAGE_INDEX}
      onChange={handleChange}
    />
  );
}

interface TimeseriesControlsProps {
  query: Lib.Query;
  stageIndex: number;
  onChange: (query: Lib.Query) => void;
}

function TimeseriesControls({
  query,
  stageIndex,
  onChange,
}: TimeseriesControlsProps) {
  const breakoutColumn = useMemo(
    () => findBreakoutColumn(query, stageIndex),
    [query, stageIndex],
  );

  const breakout = useMemo(
    () =>
      breakoutColumn && findBreakoutClause(query, stageIndex, breakoutColumn),
    [query, stageIndex, breakoutColumn],
  );

  const filterColumn = useMemo(
    () => breakoutColumn && findFilterColumn(query, stageIndex, breakoutColumn),
    [query, stageIndex, breakoutColumn],
  );

  const filter = useMemo(
    () => filterColumn && findFilterClause(query, stageIndex, filterColumn),
    [query, stageIndex, filterColumn],
  );

  const handleFilterChange = (
    newFilter: Lib.ExpressionClause | Lib.SegmentMetadata,
  ) => {
    if (filter) {
      onChange(Lib.replaceClause(query, stageIndex, filter, newFilter));
    } else {
      onChange(Lib.filter(query, stageIndex, newFilter));
    }
  };

  const handleBreakoutChange = (newColumn: Lib.ColumnMetadata) => {
    if (breakout) {
      onChange(Lib.replaceClause(query, stageIndex, breakout, newColumn));
    }
  };

  if (!breakoutColumn || !filterColumn) {
    return null;
  }

  return (
    <Group p="md" position="center" spacing="sm">
      <Text>{t`View`}</Text>
      <TemporalFilterSelect
        query={query}
        stageIndex={stageIndex}
        column={filterColumn}
        filter={filter}
        onChange={handleFilterChange}
      />
      <Text>{t`by`}</Text>
      <TemporalBucketSelect
        query={query}
        stageIndex={stageIndex}
        column={breakoutColumn}
        onChange={handleBreakoutChange}
      />
    </Group>
  );
}
