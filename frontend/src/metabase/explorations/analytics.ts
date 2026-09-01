import { trackSimpleEvent } from "metabase/analytics";
import type { ExplorationId } from "metabase-types/api";

import type { ExplorationSidebarTab } from "./types";

export const trackExplorationAgentMessageSent = (
  triggered_from: "entry" | "plan_chat",
) => {
  trackSimpleEvent({
    event: "exploration_agent_message_sent",
    triggered_from,
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

export const trackExplorationManualSetupClicked = () => {
  trackSimpleEvent({
    event: "exploration_manual_setup_clicked",
  });
};

export const trackExplorationExploreFurtherClicked = (
  explorationId: ExplorationId,
  result: "success" | "failure",
) => {
  trackSimpleEvent({
    event: "exploration_explore_further_clicked",
    target_id: explorationId,
    result,
  });
};

export const trackExplorationCommentCreated = (
  explorationId: ExplorationId,
  triggered_from: "chart_click" | "toolbar" | "sidebar",
) => {
  trackSimpleEvent({
    event: "exploration_comment_created",
    target_id: explorationId,
    triggered_from,
  });
};

export const trackExplorationPageStarToggled = (
  explorationId: ExplorationId,
  event_detail: "starred" | "unstarred",
) => {
  trackSimpleEvent({
    event: "exploration_page_star_toggled",
    target_id: explorationId,
    event_detail,
  });
};

export const trackExplorationPageHiddenToggled = (
  explorationId: ExplorationId,
  event_detail: "hidden" | "shown",
  triggered_from: "page" | "group",
) => {
  trackSimpleEvent({
    event: "exploration_page_hidden_toggled",
    target_id: explorationId,
    event_detail,
    triggered_from,
  });
};

export const trackExplorationSidebarTabChanged = (
  explorationId: ExplorationId,
  event_detail: ExplorationSidebarTab,
) => {
  trackSimpleEvent({
    event: "exploration_sidebar_tab_changed",
    target_id: explorationId,
    event_detail,
  });
};
