import { useMemo } from "react";
import { t } from "ttag";
import { Group, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/Question";
import { TimeseriesBucketPicker } from "./TimeseriesBucketPicker";
import { TimeseriesFilterPicker } from "./TimeseriesFilterPicker";
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

  const isTemporalBucketable = useMemo(
    () =>
      breakoutColumn &&
      Lib.isTemporalBucketable(query, stageIndex, breakoutColumn),
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

  const handleBreakoutChange = (newBreakout: Lib.ColumnMetadata) => {
    if (breakout) {
      onChange(Lib.replaceClause(query, stageIndex, breakout, newBreakout));
    }
  };

  const handleFilterChange = (newFilter: Lib.ExpressionClause | undefined) => {
    if (filter && newFilter) {
      onChange(Lib.replaceClause(query, stageIndex, filter, newFilter));
    } else if (newFilter) {
      onChange(Lib.filter(query, stageIndex, newFilter));
    } else if (filter) {
      onChange(Lib.removeClause(query, stageIndex, filter));
    }
  };

  if (!breakoutColumn || !filterColumn) {
    return null;
  }

  return (
    <Group
      p="md"
      position="center"
      spacing="sm"
      data-testid="timeseries-chrome"
    >
      <Text>{t`View`}</Text>
      <TimeseriesFilterPicker
        query={query}
        stageIndex={stageIndex}
        column={filterColumn}
        filter={filter}
        onChange={handleFilterChange}
      />
      {isTemporalBucketable && (
        <>
          <Text>{t`by`}</Text>
          <TimeseriesBucketPicker
            query={query}
            stageIndex={stageIndex}
            column={breakoutColumn}
            onChange={handleBreakoutChange}
          />
        </>
      )}
    </Group>
  );
}
