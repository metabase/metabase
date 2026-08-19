import type { VisualizationSettingsDefinitions } from "metabase/visualizations/types";

export const TIMELINE_EVENTS_SETTINGS: VisualizationSettingsDefinitions = {
  "timeline_events.enabled": {
    getDefault: () => true,
  },
};
