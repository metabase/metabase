import { trackSimpleEvent } from "metabase/analytics";
import type { MetricsViewerDisplayType } from "metabase/common/metrics-viewer";

import type { CardGeneratorId } from "./types";

export const trackMetricCubeViewerViewed = (generatorId: CardGeneratorId) => {
  trackSimpleEvent({
    event: "metric_cube_viewer_viewed",
    event_detail: generatorId,
  });
};

export const trackMetricCubeViewerSettingsApplied = (
  generatorId: CardGeneratorId,
) => {
  trackSimpleEvent({
    event: "metric_cube_viewer_settings_applied",
    event_detail: generatorId,
  });
};

export const trackMetricCubeViewerCardAdded = (
  generatorId: CardGeneratorId,
) => {
  trackSimpleEvent({
    event: "metric_cube_viewer_card_added",
    event_detail: generatorId,
  });
};

export const trackMetricCubeViewerCardEdited = (
  generatorId: CardGeneratorId,
) => {
  trackSimpleEvent({
    event: "metric_cube_viewer_card_edited",
    event_detail: generatorId,
  });
};

export const trackMetricCubeViewerCardRemoved = (
  generatorId: CardGeneratorId,
) => {
  trackSimpleEvent({
    event: "metric_cube_viewer_card_removed",
    event_detail: generatorId,
  });
};

export const trackMetricCubeViewerDisplayChanged = (
  display: MetricsViewerDisplayType,
) => {
  trackSimpleEvent({
    event: "metric_cube_viewer_display_changed",
    event_detail: display,
  });
};

export const trackMetricCubeViewerReset = (generatorId: CardGeneratorId) => {
  trackSimpleEvent({
    event: "metric_cube_viewer_reset",
    event_detail: generatorId,
  });
};
