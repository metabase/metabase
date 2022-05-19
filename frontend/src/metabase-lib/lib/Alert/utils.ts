import Question from "metabase-lib/lib/Question";
import { VisualizationSettings } from "metabase-types/types/Card";
import {
  ALERT_TYPE_PROGRESS_BAR_GOAL,
  ALERT_TYPE_ROWS,
  ALERT_TYPE_TIMESERIES_GOAL,
} from "./constants";
import { AlertType } from "./types";

/**
 * Returns the type of alert that current question supports
 *
 * The `visualization_settings` in card object doesn't contain default settings,
 * so you can provide the complete visualization settings object to `alertType`
 * for taking those into account
 */
export function getAlertType(
  question: Question,
  visualizationSettings: VisualizationSettings,
): AlertType | null {
  if (!question.canRun()) {
    return null;
  }

  const display = question.display();
  const isLineAreaBar =
    display === "line" || display === "area" || display === "bar";

  if (display === "progress") {
    return ALERT_TYPE_PROGRESS_BAR_GOAL;
  } else if (isLineAreaBar) {
    const vizSettings = visualizationSettings
      ? visualizationSettings
      : question.card().visualization_settings;
    const goalEnabled = vizSettings["graph.show_goal"];
    const hasSingleYAxisColumn =
      vizSettings["graph.metrics"] && vizSettings["graph.metrics"].length === 1;

    // We don't currently support goal alerts for multiseries question
    if (goalEnabled && hasSingleYAxisColumn) {
      return ALERT_TYPE_TIMESERIES_GOAL;
    }
  }

  return ALERT_TYPE_ROWS;
}
