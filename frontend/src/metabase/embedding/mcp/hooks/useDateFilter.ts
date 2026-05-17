import { t } from "ttag";

import type { DatePickerValue } from "metabase/querying/common/types";
import { getDateFilterDisplayName } from "metabase/querying/common/utils/dates";
import {
  getDateFilterClause,
  getDatePickerUnits,
  getDatePickerValue,
} from "metabase/querying/filters/utils/dates";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { LAST_QUERY_STAGE_INDEX } from "./constants";

type UpdateQuestion = (question: Question, opts: { run: boolean }) => void;

export interface UseDateFilterResult {
  dateFilterClause: Lib.FilterClause | null;
  dateFilterValue: DatePickerValue | undefined;
  dateFilterLabel: string;
  datePickerUnits: ReturnType<typeof getDatePickerUnits>;
  handleDateFilterChange: (value: DatePickerValue) => void;
  handleDateFilterClear: () => void;
}

export function useDateFilter(
  question: Question | undefined,
  updateQuestion: UpdateQuestion,
  rawTemporalColumn: Lib.ColumnMetadata | null,
): UseDateFilterResult {
  const empty: UseDateFilterResult = {
    dateFilterClause: null,
    dateFilterValue: undefined,
    dateFilterLabel: t`All time`,
    datePickerUnits: [],

    handleDateFilterChange: () => {},
    handleDateFilterClear: () => {},
  };

  if (!question) {
    return empty;
  }

  const query = question.query();
  const stageIndex = LAST_QUERY_STAGE_INDEX;

  const allFilters = Lib.filters(query, stageIndex);

  let dateFilterClause: Lib.FilterClause | null = null;
  let dateFilterValue: DatePickerValue | undefined = undefined;

  for (const filter of allFilters) {
    const nextDateFilterValue = getDatePickerValue(query, stageIndex, filter);

    if (nextDateFilterValue != null) {
      dateFilterClause = filter;
      dateFilterValue = nextDateFilterValue;

      break;
    }
  }

  const dateFilterLabel = dateFilterValue
    ? getDateFilterDisplayName(dateFilterValue)
    : t`All time`;

  const datePickerUnits = rawTemporalColumn
    ? getDatePickerUnits(query, stageIndex, rawTemporalColumn)
    : [];

  const handleDateFilterChange = (value: DatePickerValue) => {
    if (!rawTemporalColumn) {
      return;
    }

    const newFilterClause = getDateFilterClause(rawTemporalColumn, value);
    const newQuery = dateFilterClause
      ? Lib.replaceClause(query, stageIndex, dateFilterClause, newFilterClause)
      : Lib.filter(query, stageIndex, newFilterClause);

    updateQuestion(question.setQuery(newQuery), { run: true });
  };

  const handleDateFilterClear = () => {
    if (!dateFilterClause) {
      return;
    }

    const newQuery = Lib.removeClause(query, stageIndex, dateFilterClause);
    updateQuestion(question.setQuery(newQuery), { run: true });
  };

  return {
    dateFilterClause,
    dateFilterValue,
    dateFilterLabel,
    datePickerUnits,

    handleDateFilterChange,
    handleDateFilterClear,
  };
}
