import { getVisualization } from "metabase/visualizations";
import type { VisualizationSettingDefinition } from "metabase/visualizations/types";
import type { VisualizationDisplay } from "metabase-types/api";

import {
  DEFAULT_VISUALIZER_DISPLAY,
  isVisualizerSupportedVisualization,
} from "./dashboard-card-supports-visualizer";

const isDataSetting = ({
  widget,
}: VisualizationSettingDefinition<unknown, unknown>) => {
  // TODO Come up with a better condition
  return widget === "field" || widget === "fields";
};

export function getColumnVizSettings(cardDisplay: VisualizationDisplay) {
  const display = isVisualizerSupportedVisualization(cardDisplay)
    ? cardDisplay
    : DEFAULT_VISUALIZER_DISPLAY;
  const visualization = getVisualization(display);
  const settings = visualization?.settings ?? {};

  // TODO Come up with a better condition
  return Object.keys(settings).filter((key) => {
    return isDataSetting(settings[key] ?? {});
  });
}
