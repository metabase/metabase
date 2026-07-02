import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

/**
 * Matches main app's FilterHeaderButton/QuestionSummarizeWidget/QuestionNotebookButton
 * gating. Three of the main app's conditions don't apply to the SDK and are omitted:
 * - `queryBuilderMode` — no notebook-mode toggle exposed by the SDK
 * - `isObjectDetail` — the SDK hardcodes `isObjectDetail={false}` in Visualization.tsx
 * - `isActionListVisible` — governs the legacy static/iframe embed's `action_buttons` option
 */
export function shouldRenderQueryBuilderEditingControl(
  question: Question | undefined,
): boolean {
  if (!question) {
    return false;
  }

  const { isEditable, isNative } = Lib.queryDisplayInfo(question.query());

  return isEditable && !isNative && !question.isArchived();
}
