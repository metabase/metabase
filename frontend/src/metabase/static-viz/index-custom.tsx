import ReactDOMServer from "react-dom/server";

import "metabase/utils/dayjs";

import { StaticVisualizationCustom } from "metabase/static-viz/components/StaticVisualization/StaticVisualizationCustom";
import {
  getRawSeriesWithDashcardSettings,
  initializeContext,
  toRenderedChart,
} from "metabase/static-viz/lib/entrypoint";
import { createStaticRenderingContext } from "metabase/static-viz/lib/rendering-context";
import { updateStartOfWeek } from "metabase/utils/i18n";
import { extractRemappings } from "metabase/visualizations";
import type {
  DashCardVisualizationSettings,
  RawSeries,
} from "metabase-types/api";

import type {
  IsomorphicChartInput,
  RenderChartOptions,
  RenderedChart,
} from "./types";

export type { RenderChartOptions, RenderedChart } from "./types";

export {
  initializeContext,
  registerCustomVizPlugin,
} from "metabase/static-viz/lib/entrypoint";

function RenderChart(
  rawSeries: RawSeries,
  dashcardSettings: DashCardVisualizationSettings,
  options: RenderChartOptions,
) {
  initializeContext(options);

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
      width={options.width}
      height={options.height}
      fitWithinBounds={options.fitWithinBounds}
    />,
  );
}

export function renderChart(input: IsomorphicChartInput): RenderedChart {
  return toRenderedChart(
    RenderChart(input.rawSeries, input.dashcardSettings, input.options),
  );
}
