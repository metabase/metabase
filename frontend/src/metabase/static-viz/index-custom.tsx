import "./mock-environment";
import "fast-text-encoding";

import ReactDOMServer from "react-dom/server";

// eslint-disable-next-line import/order
import enterpriseOverrides from "ee-overrides";
import "metabase/utils/dayjs";

import { StaticVisualizationCustom } from "metabase/static-viz/components/StaticVisualization/StaticVisualizationCustom";
import {
  type RenderChartOptions,
  applyRenderChartSettings,
  getRawSeriesWithDashcardSettings,
  initializeStaticVizContext,
  installStaticVizApi,
  registerCustomVizPlugin,
} from "metabase/static-viz/lib/entry-shared";
import { createStaticRenderingContext } from "metabase/static-viz/lib/rendering-context";
import { updateStartOfWeek } from "metabase/utils/i18n";
import { extractRemappings } from "metabase/visualizations";
import type {
  DashCardVisualizationSettings,
  RawSeries,
} from "metabase-types/api";

// Slim entry for the custom-viz-only static bundle (lib-static-viz-custom.bundle.js),
// loaded into the untrusted plugin isolate. It exposes the same `StaticViz` interface
// surface as ./index (minus LegacyRenderChart, which only the trusted pool invokes)
// but renders exclusively `custom:` cards, so the built-in chart implementations and
// the ECharts/visx/geo stack never enter this bundle. See StaticVisualizationCustom.

installStaticVizApi();

export type { RenderChartOptions };
export { registerCustomVizPlugin };

/**
 * Initialize the static viz context: set settings and apply enterprise overrides.
 * Must be called before registerCustomVizPlugin so that the EE registry is active.
 */
export function initializeContext(options: RenderChartOptions) {
  initializeStaticVizContext(options, enterpriseOverrides);
}

export function RenderChart(
  rawSeries: RawSeries,
  dashcardSettings: DashCardVisualizationSettings,
  options: RenderChartOptions,
) {
  applyRenderChartSettings(options, enterpriseOverrides);

  const renderingContext = createStaticRenderingContext(
    options.applicationColors,
  );

  updateStartOfWeek(options.startOfWeek);
  const rawSeriesWithDashcardSettings = getRawSeriesWithDashcardSettings(
    rawSeries,
    dashcardSettings,
  );
  const rawSeriesWithRemappings = extractRemappings(
    rawSeriesWithDashcardSettings,
  );

  const hasDevWatermark = Boolean(options.tokenFeatures.development_mode);

  return ReactDOMServer.renderToStaticMarkup(
    <StaticVisualizationCustom
      rawSeries={rawSeriesWithRemappings}
      renderingContext={renderingContext}
      hasDevWatermark={hasDevWatermark}
    />,
  );
}
