// Deep import (not the metabase/plugins barrel) so the slim bundle doesn't drag
// the whole app UI stack in via the barrel's other plugin modules.
import { PLUGIN_CUSTOM_VIZ_STATIC } from "metabase/plugins/oss/custom-viz-static";
import { getVisualizationTransformed } from "metabase/visualizations";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import type { StaticVisualizationProps } from "metabase/visualizations/types";

/**
 * Custom-viz-only variant of StaticVisualization for the slim bundle loaded into the
 * untrusted plugin isolate. It deliberately imports none of the built-in chart
 * components (and never calls registerStaticVisualizations), so the ECharts/visx
 * stack stays out of the bundle. The isolate only ever renders `custom:` cards.
 */
export const StaticVisualizationCustom = ({
  rawSeries,
  renderingContext,
  isStorybook,
  hasDevWatermark,
}: StaticVisualizationProps) => {
  const display = rawSeries[0].card.display;
  const transformedSeries = getVisualizationTransformed(rawSeries).series;
  const settings = getComputedSettingsForSeries(transformedSeries);

  if (typeof display === "string" && display.startsWith("custom:")) {
    const customViz = PLUGIN_CUSTOM_VIZ_STATIC.customVizRegistry.get(display);
    if (customViz?.StaticVisualizationComponent) {
      const { StaticVisualizationComponent } = customViz;
      return (
        <StaticVisualizationComponent
          series={rawSeries}
          renderingContext={renderingContext}
          settings={settings}
          isStorybook={isStorybook}
          hasDevWatermark={hasDevWatermark}
        />
      );
    }
    // Plugin registered but has no StaticVisualizationComponent.
    // Return null so the Clojure side gets an empty string and falls back to table.
    return null;
  }

  throw new Error(
    `Unsupported display type in custom-viz static bundle: ${display}`,
  );
};
