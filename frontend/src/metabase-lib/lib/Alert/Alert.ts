import Question from "metabase-lib/lib/Question";
import { VisualizationSettings } from "metabase-types/types/Card";
import { User } from "metabase-types/types/User";
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
function getAlertType(
  question: Question,
  visualizationSettings: VisualizationSettings,
): AlertType | null {
  const display = question.display();

  if (!question.canRun()) {
    return null;
  }

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

export const getDefaultAlert = (
  question: Question,
  user: User,
  visualizationSettings: VisualizationSettings,
) => {
  const alertType = getAlertType(question, visualizationSettings);
  const typeDependentAlertFields =
    alertType === ALERT_TYPE_ROWS
      ? {
          alert_condition: "rows",
          alert_first_only: false,
        }
      : {
          alert_condition: "goal",
          alert_first_only: true,
          alert_above_goal: true,
        };

  return {
    card: {
      id: question.id(),
      include_csv: false,
      include_xls: false,
    },
    channels: [
      {
        enabled: true,
        channel_type: "email",
        recipients: [user],
        schedule_day: "mon",
        schedule_frame: null,
        schedule_hour: 0,
        schedule_type: "daily",
      },
    ],
    ...typeDependentAlertFields,
  };
};
