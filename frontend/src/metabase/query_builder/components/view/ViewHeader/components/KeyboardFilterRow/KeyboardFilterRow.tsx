import { useContext } from "react";
import { useLatest } from "react-use";

import { FilterAutoApplyContext } from "metabase/querying/filters/components/FilterPicker/FilterAutoApplyContext";
import type { QueryBuilderMode } from "metabase/redux/store";
import { Flex } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { areQueriesIdentical } from "../../../FilterAutoApply/utils";

import { FilterExpressionBar } from "./FilterExpressionBar";
import S from "./KeyboardFilterRow.module.css";

interface KeyboardFilterRowProps {
  question: Question;
  expanded: boolean;
  /** Bumped when the user asks for a new filter: the bar opens its caret at the end. */
  draftKey: number | null;
  onRemoveDraft: () => void;
  updateQuestion: (
    question: Question,
    opts?: { run?: boolean; shouldUpdateUrl?: boolean },
  ) => void;
}

/**
 * Prototype: the filters of the question as one expression bar, with OR and
 * parentheses typed between the pills. On data where filters apply as the
 * user changes them, every valid expression applies at once.
 */
export function KeyboardFilterRow({
  question,
  expanded,
  draftKey,
  onRemoveDraft,
  updateQuestion,
}: KeyboardFilterRowProps) {
  const query = question.query();
  const autoApply = useContext(FilterAutoApplyContext);
  const latestQuestion = useLatest(question);
  const isAutoApply = autoApply?.isEnabled(query) ?? false;

  const setQuery = (newQuery: Lib.Query) => {
    const question = latestQuestion.current;
    // Prototype: a change in the filter bar can be only a group of ANDs that
    // is added or removed, and a comparison that flattens them misses it.
    if (!areQueriesIdentical(newQuery, question.query())) {
      // Prototype: on slow data, a filter change only makes the result out of
      // date, and the user reruns the question with the run button.
      const isSlowData = !(autoApply?.isEnabled(newQuery) ?? true);
      updateQuestion(question.setQuery(newQuery), {
        run: !isSlowData,
        shouldUpdateUrl: isSlowData,
      });
    }
  };

  if (!expanded) {
    return null;
  }

  return (
    <Flex
      className={S.row}
      align="center"
      py="sm"
      data-testid="keyboard-filter-row"
    >
      <FilterExpressionBar
        query={query}
        isAutoApply={isAutoApply}
        openKey={draftKey}
        onFold={onRemoveDraft}
        onChange={setQuery}
      />
    </Flex>
  );
}

type RenderCheckOpts = {
  question: Question;
  queryBuilderMode: QueryBuilderMode;
};

KeyboardFilterRow.shouldRender = ({
  question,
  queryBuilderMode,
}: RenderCheckOpts) => {
  const { isEditable, isNative } = Lib.queryDisplayInfo(question.query());
  return (
    queryBuilderMode === "view" &&
    !isNative &&
    isEditable &&
    !question.isArchived()
  );
};
