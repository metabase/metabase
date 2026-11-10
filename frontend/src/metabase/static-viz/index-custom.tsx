import ReactDOMServer from "react-dom/server";

import { CustomStaticVisualization } from "metabase/static-viz/components/StaticVisualization/CustomStaticVisualization";
import {
  getRawSeriesWithDashcardSettings,
  initializeContext,
  toRenderedChart,
} from "metabase/static-viz/lib/entrypoint";
import { createStaticRenderingContext } from "metabase/static-viz/lib/rendering-context";
import { updateStartOfWeek } from "metabase/utils/i18n";
import { extractRemappings } from "metabase/viz-core";
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

  return ReactDOMServer.renderToStaticMarkup(
    <CustomStaticVisualization
      rawSeries={rawSeriesWithRemappings}
      renderingContext={renderingContext}
      width={options.width}
      height={options.height}
    />,
  );
}

export function renderChart(input: IsomorphicChartInput): RenderedChart {
  return toRenderedChart(
    RenderChart(input.rawSeries, input.dashcardSettings, input.options),
  );
}
