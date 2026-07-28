// eslint-disable-next-line import/order
import enterpriseOverrides from "ee-overrides";

import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins/oss/custom-viz";
import MetabaseSettings from "metabase/utils/settings";
import { extendCardWithDashcardSettings } from "metabase/visualizations/lib/settings/typed-utils";
import type {
  CustomVizPluginId,
  DashCardVisualizationSettings,
  RawSeries,
  SettingKey,
} from "metabase-types/api";

import type { RenderChartOptions, RenderedChart } from "../types";

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

export function getRawSeriesWithDashcardSettings(
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

export function toRenderedChart(content: string): RenderedChart {
  return { type: content.startsWith("<svg") ? "svg" : "html", content };
}
