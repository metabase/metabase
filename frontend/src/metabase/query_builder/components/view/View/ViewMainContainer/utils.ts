import { isSummarizeColumnAction } from "metabase/querying/drills/utils/summarize-column-drill";
import type { ClickAction } from "metabase/visualizations/types";

export function withSummarizeColumnCallback(
  actions: ClickAction[],
  onSummarizeColumn: () => void,
): ClickAction[] {
  return actions.map((action) => {
    if (!("action" in action) || !isSummarizeColumnAction(action)) {
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
