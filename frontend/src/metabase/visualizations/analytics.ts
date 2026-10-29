import { match } from "ts-pattern";

import { trackSimpleEvent } from "metabase/analytics";
import type { ReferencedEntityKind } from "metabase/viz-core";
import type {
  ReferencedEntityType,
  VisualizationDisplay,
} from "metabase-types/api";

import type { RegularClickAction } from "./types";

export const trackClickActionPerformed = (action: RegularClickAction) => {
  trackSimpleEvent({
    event: "click_action",
    triggered_from: action.section,
  });

  if (action.section === "auto-popover") {
    const event = match(action.name)
      .with("automatic-insights.compare", () => "compare_to_rest" as const)
      .with("automatic-insights.xray", () => "x-ray" as const)
      .otherwise(() => "x-ray" as const);

    trackSimpleEvent({
      event: "x-ray_automatic_insights_clicked",
      event_detail: event,
    });
  }
};

export const trackTableFreezeColumnsEnabled = () => {
  trackSimpleEvent({
    event: "table_freeze_columns_enabled",
    triggered_from: "viz_settings",
  });
};

export const trackTableFreezeRowsEnabled = () => {
  trackSimpleEvent({
    event: "table_freeze_rows_enabled",
    triggered_from: "viz_settings",
  });
};

export type DynamicGoalSource =
  | ReferencedEntityKind
  | ReferencedEntityType
  | "self_column";

export function trackDynamicGoalSet(
  display: VisualizationDisplay,
  source: DynamicGoalSource,
) {
  trackSimpleEvent({
    event: "dynamic_goal_set",
    triggered_from: display,
    event_detail: source,
  });
}

export function trackDynamicGoalReplaced(
  display: VisualizationDisplay,
  source: DynamicGoalSource,
) {
  trackSimpleEvent({
    event: "dynamic_goal_replaced",
    triggered_from: display,
    event_detail: source,
  });
}

export function trackDynamicGoalRemoved(
  display: VisualizationDisplay,
  source: DynamicGoalSource,
) {
  trackSimpleEvent({
    event: "dynamic_goal_removed",
    triggered_from: display,
    event_detail: source,
  });
}
