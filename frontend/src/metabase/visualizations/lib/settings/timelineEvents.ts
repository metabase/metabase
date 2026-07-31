import { t } from "ttag";

import type { VisualizationSettingsDefinitions } from "metabase/visualizations/types";

export const TIMELINE_EVENTS_SETTINGS: VisualizationSettingsDefinitions = {
  // No default on purpose: an absent selection means "follow the dashboard
  // collection's timelines", while a stored empty selection means "hidden".
  "timeline.selected_timeline_ids": {
    getSection: () => t`Display`,
    get title() {
      return t`Timeline events`;
    },
    // Registered in metabase/visualizations/register so the widget component is
    // not pulled into the static-viz bundle through the chart definitions.
    widget: "timelineEvents",
    getHidden: (_series, vizSettings) =>
      vizSettings["graph.x_axis.scale"] !== "timeseries",
    readDependencies: ["graph.x_axis.scale"],
    // In the query builder events are managed through the timeline sidebar,
    // so the picker is only shown for dashboard cards.
    dashboard: true,
  },
};
