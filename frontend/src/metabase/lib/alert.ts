import type Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { Card, VisualizationSettings } from "metabase-types/api";

import { canRunCard } from "./card";

export const ALERT_TYPE_ROWS = "alert-type-rows";
export const ALERT_TYPE_TIMESERIES_GOAL = "alert-type-timeseries-goal";
export const ALERT_TYPE_PROGRESS_BAR_GOAL = "alert-type-progress-bar-goal";

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- used for types
const AlertTypes = [
  ALERT_TYPE_ROWS,
  ALERT_TYPE_TIMESERIES_GOAL,
  ALERT_TYPE_PROGRESS_BAR_GOAL,
] as const;

export type NotificationTriggerType = (typeof AlertTypes)[number];

/**
 * Returns the type of alert that the card supports.
 *
 * @param Metadata -
 *   The card for which to return the alert type.
 *
 * @param card -
 *   The card for which to return the alert type.
 *
 * @param metadata -
 *   The `visualization_settings` in card object doesn't contain default settings,
 *   so you can provide the complete visualization settings object to `alertType`
 *   for taking those into account
 */
export function getCardAlertType(
  metadata: Metadata,
  card: Card,
  visualizationSettings?: VisualizationSettings | null,
): NotificationTriggerType | null {
  if (!canRunCard(metadata, card)) {
    return null;
  }

  const { display } = card;

  const isLineAreaBar =
    display === "line" || display === "area" || display === "bar";

  const vizSettings = visualizationSettings
    ? visualizationSettings
    : card.visualization_settings;

  if (display === "progress") {
    return ALERT_TYPE_PROGRESS_BAR_GOAL;
  } else if (isLineAreaBar) {
    const goalEnabled = vizSettings["graph.show_goal"];
    const hasSingleYAxisColumn =
      vizSettings["graph.metrics"] && vizSettings["graph.metrics"].length === 1;

    // We don't currently support goal alerts for multiseries question
    if (goalEnabled && hasSingleYAxisColumn) {
      return ALERT_TYPE_TIMESERIES_GOAL;
    } else {
      return ALERT_TYPE_ROWS;
    }
  } else {
    return ALERT_TYPE_ROWS;
  }
}

/**
 * Returns the type of alert that the question supports.
 *
 * @param question -
 *   The question for which to return the alert type.
 *
 * @param metadata -
 *   The `visualization_settings` in card object doesn't contain default settings,
 *   so you can provide the complete visualization settings object to `alertType`
 *   for taking those into account
 */
export function getQuestionAlertType(
  question?: Question | null,
  visualizationSettings?: VisualizationSettings | null,
): NotificationTriggerType | null {
  if (!question) {
    return null;
  }
  return getCardAlertType(
    question.metadata(),
    question.card(),
    visualizationSettings,
  );
}
