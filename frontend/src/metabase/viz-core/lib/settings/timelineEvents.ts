import type { VisualizationSettingsDefinitions } from "../../types";

export const TIMELINE_EVENTS_SETTINGS: VisualizationSettingsDefinitions = {
  "timeline_events.enabled": {
    getDefault: () => true,
  },
  "timeline.selected_timeline_ids": {
    hidden: true,
    getDefault: () => [],
  },
  "timeline.excluded_timeline_event_ids": {
    hidden: true,
    getDefault: () => [],
  },
};
