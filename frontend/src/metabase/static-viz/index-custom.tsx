import ReactDOMServer from "react-dom/server";

// eslint-disable-next-line import/order
import enterpriseOverrides from "ee-overrides";
import "metabase/utils/dayjs";

import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins/oss/custom-viz";
import { StaticVisualizationCustom } from "metabase/static-viz/components/StaticVisualization/StaticVisualizationCustom";
import { createStaticRenderingContext } from "metabase/static-viz/lib/rendering-context";
import { updateStartOfWeek } from "metabase/utils/i18n";
import MetabaseSettings from "metabase/utils/settings";
import { extractRemappings } from "metabase/visualizations";
import { extendCardWithDashcardSettings } from "metabase/visualizations/lib/settings/typed-utils";
import type {
  CustomVizPluginId,
  DashCardVisualizationSettings,
  RawSeries,
  SettingKey,
} from "metabase-types/api";

import type {
  IsomorphicChartInput,
  RenderChartOptions,
  RenderedChart,
} from "./types";

export type { RenderChartOptions, RenderedChart } from "./types";

/**
 * Initialize the static viz context: set settings and apply enterprise overrides.
 * Must be called before registerCustomVizPlugin so that the EE registry is active.
 */
export function initializeContext(options: RenderChartOptions) {
  MetabaseSettings.set("token-features", options.tokenFeatures);
  MetabaseSettings.set(
    // Unjustified type cast. FIXME
    "application-colors" as SettingKey,
    options.applicationColors,
  );

  if (typeof enterpriseOverrides === "function") {
    enterpriseOverrides();
  }

  MetabaseSettings.set("custom-formatting", options.customFormatting);
  MetabaseSettings.set("site-locale", options.locale ?? "en");
}

export function registerCustomVizPlugin(
  factory: Parameters<typeof PLUGIN_CUSTOM_VIZ.registerCustomVizPlugin>[0],
  identifier: string,
  pluginId: CustomVizPluginId,
) {
  PLUGIN_CUSTOM_VIZ.registerCustomVizPlugin(factory, identifier, pluginId);
}

function getRawSeriesWithDashcardSettings(
  rawSeries: RawSeries,
  dashcardSettings: DashCardVisualizationSettings,
): RawSeries {
  return rawSeries.map((series, index) => {
    const isMainCard = index === 0;
    if (isMainCard) {
      return {
        ...series,
        card: extendCardWithDashcardSettings(series.card, dashcardSettings),
      };
    }
    return series;
  });
}

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
  const content = RenderChart(
    input.rawSeries,
    input.dashcardSettings,
    input.options,
  );
  return { type: content.startsWith("<svg") ? "svg" : "html", content };
}
