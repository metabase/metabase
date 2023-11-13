import { useMemo } from "react";
import { t } from "ttag";
import { Group, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/Question";
import { TemporalBucketSelect } from "./TemporalBucketSelect";
import { findBreakoutClause, findColumn } from "./utils";

const STAGE_INDEX = -1;

interface UpdateQuestionOpts {
  run?: boolean;
}

interface TimeseriesFooterProps {
  question: Question;
  updateQuestion: (newQuestion: Question, opts?: UpdateQuestionOpts) => void;
}

export function TimeseriesFooter({
  question,
  updateQuestion,
}: TimeseriesFooterProps) {
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
    <Group p="md" position="center" spacing="sm">
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
