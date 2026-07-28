import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins/oss/custom-viz";
import { getVisualizationTransformed } from "metabase/visualizations";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import type { StaticVisualizationProps } from "metabase/visualizations/types";
import { isCustomVizDisplay } from "metabase-types/guards";

export const CustomStaticVisualization = ({
  rawSeries,
  renderingContext,
  isStorybook,
  hasDevWatermark,
  width,
  height,
}: StaticVisualizationProps) => {
  const display = rawSeries[0].card.display;

  if (!isCustomVizDisplay(display)) {
    throw new Error(
      `Unsupported display type for custom static visualization: ${display}`,
    );
  }

  const customViz = PLUGIN_CUSTOM_VIZ.customVizRegistry.get(display);

  if (!customViz?.StaticVisualizationComponent) {
    // Return null so the Clojure side gets an empty string and falls back to table.
    return null;
  }

  const transformedSeries = getVisualizationTransformed(rawSeries).series;
  const settings = getComputedSettingsForSeries(transformedSeries);
  const { StaticVisualizationComponent } = customViz;

  const customVizRenderingContext = {
    getColor: renderingContext.getColor,
    measureTextWidth: renderingContext.measureText,
    measureTextHeight: renderingContext.measureTextHeight,
    fontFamily: renderingContext.fontFamily,
  };

  return (
    <StaticVisualizationComponent
      series={rawSeries}
      renderingContext={customVizRenderingContext}
      settings={settings}
      isStorybook={isStorybook}
      hasDevWatermark={hasDevWatermark}
      width={width}
      height={height}
    />
  );
};
