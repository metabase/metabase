import { t } from "ttag";

import type { VisualizationSettingsDefinitions } from "metabase/visualizations/types";

export const TIMELINE_EVENTS_SETTINGS: VisualizationSettingsDefinitions = {
  "timeline.events_enabled": {
    getSection: () => t`Display`,
    get title() {
      return t`Timeline events`;
    },
    widget: "toggle",
    getDefault: () => true,
    inline: true,
    getHidden: (_series, vizSettings) =>
      vizSettings["graph.x_axis.scale"] !== "timeseries",
    readDependencies: ["graph.x_axis.scale"],
    // In the query builder events are managed through the timeline sidebar,
    // so the toggle is only shown for dashboard cards.
    dashboard: true,
  },
};
