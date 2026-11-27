import { trackSimpleEvent } from "metabase/analytics";
import type { FormulaBarTriggerLocation } from "metabase/querying/components/FormulaEditor";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { getSummaryStageIndex } from "./pivot-question";
import type { SummaryWellId } from "./types";

export type SummarySidebarOpenedTriggeredFrom =
  | "summarize_button"
  | "keyboard_shortcut"
  | "column_header"
  | "column_header_summarize"
  | "chart_placeholder";

export type SummaryFieldAddedEventDetail =
  | "field_list_click"
  | "field_list_alt_click"
  | "drag_and_drop"
  | "typeahead";

export type SummaryItemRemovedEventDetail = "remove_button" | "backspace";

export type SummaryFormulaGeneratedResult = "success" | "failure";

export type SummaryPivotModeToggledTriggeredFrom =
  | "toggle_button"
  | "rows_well";

export type SummaryPivotModeToggledEventDetail = "enabled" | "disabled";

export function getFormulaBarLocation(
  wellId: SummaryWellId,
): FormulaBarTriggerLocation {
  return `summary_${wellId}`;
}

export const trackSummarySidebarOpened = (
  question: Question,
  triggeredFrom: SummarySidebarOpenedTriggeredFrom,
) => {
  const query = question.query();
  const stageIndex = getSummaryStageIndex(query);
  const isSummarized =
    Lib.aggregations(query, stageIndex).length > 0 ||
    Lib.breakouts(query, stageIndex).length > 0;
  trackSimpleEvent({
    event: "summary_sidebar_opened",
    triggered_from: triggeredFrom,
    event_detail: isSummarized ? "summarized" : "empty",
    target_id: question.isSaved() ? question.id() : null,
  });
};

export const trackSummaryFieldAdded = (
  wellId: SummaryWellId,
  detail: SummaryFieldAddedEventDetail,
) => {
  trackSimpleEvent({
    event: "summary_field_added",
    triggered_from: wellId,
    event_detail: detail,
  });
};

export const trackSummaryItemRemoved = (
  wellId: SummaryWellId,
  detail: SummaryItemRemovedEventDetail,
) => {
  trackSimpleEvent({
    event: "summary_item_removed",
    triggered_from: wellId,
    event_detail: detail,
  });
};

export const trackSummaryItemRenamed = (wellId: SummaryWellId) => {
  trackSimpleEvent({
    event: "summary_item_renamed",
    triggered_from: wellId,
  });
};

export const trackSummaryFormulaGenerated = (
  wellId: SummaryWellId,
  result: SummaryFormulaGeneratedResult,
  durationMs: number,
) => {
  trackSimpleEvent({
    event: "summary_formula_generated",
    triggered_from: wellId,
    result,
    duration_ms: durationMs,
  });
};

export const trackSummaryPivotModeToggled = (
  triggeredFrom: SummaryPivotModeToggledTriggeredFrom,
  detail: SummaryPivotModeToggledEventDetail,
) => {
  trackSimpleEvent({
    event: "summary_pivot_mode_toggled",
    triggered_from: triggeredFrom,
    event_detail: detail,
  });
};
