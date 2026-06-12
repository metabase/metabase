import { useMemo } from "react";
import { t } from "ttag";

import { Group, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { TimeseriesBucketPicker } from "./TimeseriesBucketPicker";
import { TimeseriesFilterPicker } from "./TimeseriesFilterPicker";
import {
  findBreakoutClause,
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
  const query = question.query();

  const handleChange = (query: Lib.Query) => {
    updateQuestion(question.setQuery(query), { run: true });
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
  const breakout = useMemo(
    () => findBreakoutClause(query, stageIndex),
    [query, stageIndex],
  );

  const breakoutColumn = useMemo(
    () =>
      breakout &&
      (Lib.breakoutColumn(query, stageIndex, breakout) ?? undefined),
    [query, stageIndex, breakout],
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
    () =>
      filterColumn
        ? (findFilterClause(query, stageIndex, filterColumn) ?? undefined)
        : undefined,
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

  if (!breakout || !breakoutColumn || !filterColumn) {
    return null;
  }

  return (
    <Group p="md" justify="center" gap="sm" data-testid="timeseries-chrome">
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
            breakout={breakout}
            onChange={handleBreakoutChange}
          />
        </>
      )}
    </Group>
  );
}
