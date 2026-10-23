import { type ReactNode, useMemo } from "react";
import { useLatest } from "react-use";

import {
  AUTO_APPLY_DELAY_MS,
  AUTO_APPLY_TYPED_VALUES,
  usePrototypeSetting,
} from "metabase/prototype";
import {
  FilterAutoApplyContext,
  type FilterAutoApplyContextValue,
} from "metabase/querying/filters/components/FilterPicker/FilterAutoApplyContext";
import { useDispatch } from "metabase/redux";
import type { QueryBuilderMode } from "metabase/redux/store";
import { useSetting } from "metabase/settings";
import type Question from "metabase-lib/v1/Question";

import { updateQuestion } from "../../../actions";

import { areQueriesEqual, getQueryWithFilter, readsSlowTable } from "./utils";

interface FilterAutoApplyProviderProps {
  question: Question;
  queryBuilderMode: QueryBuilderMode;
  children: ReactNode;
}

/**
 * Prototype: filter pickers inside this provider apply the filter to the
 * question as the user changes it, in the view mode, on questions that read
 * no slow table.
 */
export function FilterAutoApplyProvider({
  question,
  queryBuilderMode,
  children,
}: FilterAutoApplyProviderProps) {
  const dispatch = useDispatch();
  const [typedValuesApplyMode] = usePrototypeSetting(AUTO_APPLY_TYPED_VALUES);
  const [typingPauseMs] = usePrototypeSetting(AUTO_APPLY_DELAY_MS);
  const prototypeData = useSetting("prototype-data");
  const questionRef = useLatest(question);

  const value = useMemo<FilterAutoApplyContextValue>(
    () => ({
      isEnabled: (query) =>
        queryBuilderMode === "view" && !readsSlowTable(query, prototypeData),
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
      typedValuesApplyMode: typedValuesApplyMode === "blur" ? "blur" : "pause",
      typingPauseMs,
    }),
    [
      dispatch,
      questionRef,
      queryBuilderMode,
      prototypeData,
      typedValuesApplyMode,
      typingPauseMs,
    ],
  );

  return (
    <FilterAutoApplyContext.Provider value={value}>
      {children}
    </FilterAutoApplyContext.Provider>
  );
}
