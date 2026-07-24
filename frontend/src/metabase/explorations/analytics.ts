import { trackSimpleEvent } from "metabase/analytics";
import type { ExplorationId } from "metabase-types/api";

export const trackExplorationAgentMessageSent = () => {
  trackSimpleEvent({
    event: "exploration_agent_message_sent",
  });
};

export const trackExplorationPlanEdited = (
  triggered_from: "agent" | "manual",
  event_detail: "metrics" | "dimensions" | "timelines",
) => {
  trackSimpleEvent({
    event: "exploration_plan_edited",
    triggered_from,
    event_detail,
  });
};

export const trackExplorationCreated = (explorationId: ExplorationId) => {
  trackSimpleEvent({
    event: "exploration_created",
    target_id: explorationId,
  });
};

export const trackExplorationStopped = (explorationId: ExplorationId) => {
  trackSimpleEvent({
    event: "exploration_stopped",
    target_id: explorationId,
  });
};

export const trackExplorationRestarted = (explorationId: ExplorationId) => {
  trackSimpleEvent({
    event: "exploration_restarted",
    target_id: explorationId,
  });
};

export const trackExplorationVisualizationChanged = (
  explorationId: ExplorationId,
  triggered_from: "keyboard" | "click",
) => {
  trackSimpleEvent({
    event: "exploration_visualization_changed",
    target_id: explorationId,
    triggered_from,
  });
};

export const trackExplorationTimelineChanged = (
  explorationId: ExplorationId,
  triggered_from: "keyboard" | "click",
) => {
  trackSimpleEvent({
    event: "exploration_timeline_changed",
    target_id: explorationId,
    triggered_from,
  });
};
