import { t } from "ttag";

import type { VisualizationSettingsDefinitions } from "metabase/visualizations/types";

export const TIMELINE_EVENTS_SETTINGS: VisualizationSettingsDefinitions = {
  "timeline.selected_timeline_ids": {
    getSection: () => t`Display`,
    get title() {
      return t`Timeline events`;
    },
    // Registered in metabase/visualizations/register so the widget component is
    // not pulled into the static-viz bundle through the chart definitions.
    widget: "timelineEvents",
    getDefault: () => [],
    getHidden: (_series, vizSettings) =>
      vizSettings["graph.x_axis.scale"] !== "timeseries",
    readDependencies: ["graph.x_axis.scale"],
    // In the query builder events are managed through the timeline sidebar,
    // so the picker is only shown for dashboard cards.
    dashboard: true,
  },
  "timeline.excluded_timeline_event_ids": {
    getDefault: () => [],
  },
};
