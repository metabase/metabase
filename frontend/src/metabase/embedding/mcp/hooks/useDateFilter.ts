import { t } from "ttag";

import type { DatePickerValue } from "metabase/querying/common/types";
import { getDateFilterDisplayName } from "metabase/querying/common/utils/dates";
import {
  getDatePickerUnits,
  getDatePickerValue,
} from "metabase/querying/filters/utils/dates";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { type ApplyMcpOperations, getDateFilterOperation } from "../derive";

import { LAST_QUERY_STAGE_INDEX } from "./constants";

export interface UseDateFilterResult {
  dateFilterClause: Lib.FilterClause | null;
  dateFilterValue: DatePickerValue | undefined;
  dateFilterLabel: string;
  datePickerUnits: ReturnType<typeof getDatePickerUnits>;
  handleDateFilterChange: (value: DatePickerValue) => void;
  handleDateFilterClear: () => void;
}

/**
 * Reads the question's date filter for the time-range control. A change goes
 * to the server, which derives the refiltered query from the stored one.
 */
export function useDateFilter(
  question: Question | undefined,
  applyOperations: ApplyMcpOperations,
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

    applyOperations([getDateFilterOperation(value)]);
  };

  const handleDateFilterClear = () => {
    if (!dateFilterClause) {
      return;
    }

    applyOperations([{ type: "date-filter/clear" }]);
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
