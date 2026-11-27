import type { ClickAction } from "metabase/visualizations/types";

const SUMMARIZE_COLUMN_ACTION_PREFIX = "summarize-column.";

export function withSummarizeColumnCallback(
  actions: ClickAction[],
  onSummarizeColumn: () => void,
): ClickAction[] {
  return actions.map((action) => {
    const isSummarizeColumnAction =
      "action" in action &&
      action.name.startsWith(SUMMARIZE_COLUMN_ACTION_PREFIX);
    if (!isSummarizeColumnAction) {
      return action;
    }
    return {
      ...action,
      action: () => {
        onSummarizeColumn();
        return action.action();
      },
    };
  });
}
