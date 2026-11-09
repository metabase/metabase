import { type ReactNode, useMemo } from "react";
import { useLatest } from "react-use";

import { useIsSlowData } from "metabase/prototype";
import {
  FilterAutoApplyContext,
  type FilterAutoApplyContextValue,
} from "metabase/querying/filters/components/FilterPicker/FilterAutoApplyContext";
import { useDispatch } from "metabase/redux";
import type { QueryBuilderMode } from "metabase/redux/store";
import type Question from "metabase-lib/v1/Question";

import { updateQuestion } from "../../../actions";

import { areQueriesEqual, getQueryWithFilter } from "./utils";

interface FilterAutoApplyProviderProps {
  question: Question;
  queryBuilderMode: QueryBuilderMode;
  children: ReactNode;
}

/**
 * Prototype: filter pickers inside this provider apply the filter to the
 * question as the user changes it, in the view mode, when the data is fast.
 */
export function FilterAutoApplyProvider({
  question,
  queryBuilderMode,
  children,
}: FilterAutoApplyProviderProps) {
  const dispatch = useDispatch();
  const isSlowData = useIsSlowData();
  const questionRef = useLatest(question);

  const value = useMemo<FilterAutoApplyContextValue>(
    () => ({
      isEnabled: () => queryBuilderMode === "view" && !isSlowData,
      apply: ({ query, stageIndex, filter, draftFilter }) => {
        const question = questionRef.current;
        const newQuery = getQueryWithFilter(
          query,
          stageIndex,
          filter,
          draftFilter,
        );
        if (areQueriesEqual(newQuery, question.query())) {
          return;
        }
        dispatch(
          updateQuestion(question.setQuery(newQuery), {
            run: true,
            shouldUpdateUrl: true,
          }),
        );
      },
    }),
    [dispatch, questionRef, queryBuilderMode, isSlowData],
  );

  return (
    <FilterAutoApplyContext.Provider value={value}>
      {children}
    </FilterAutoApplyContext.Provider>
  );
}
