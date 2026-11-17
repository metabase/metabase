import type { VisualizationSettingsDefinitions } from "../../types";

// dashboard: false keeps these on the question; dashcards never persist them
export const TIMELINE_EVENTS_SETTINGS: VisualizationSettingsDefinitions = {
  "timeline_events.enabled": {
    getDefault: () => true,
    dashboard: false,
  },
  "timeline.selected_timeline_ids": {
    hidden: true,
    dashboard: false,
    getDefault: () => [],
  },
  "timeline.excluded_timeline_event_ids": {
    hidden: true,
    dashboard: false,
    getDefault: () => [],
  },
};
