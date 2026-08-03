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
 */
export function initializeContext(
  options: RenderChartOptions,
  enterpriseOverrides: unknown,
) {
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

/**
 * Register the plugin whose bundle the backend has just evaluated in this
 * context. A plugin bundle is an IIFE that assigns its factory to
 * the `__customVizPlugin__` global
 */
export function registerCustomVizPluginFromGlobal(
  identifier: string,
  pluginId: CustomVizPluginId,
) {
  // The plugin bundle assigns this global at eval time, so it isn't part of
  // the typed global scope in the GraalJS context.
  const globals = globalThis as {
    __customVizPlugin__?: Parameters<
      typeof PLUGIN_CUSTOM_VIZ.registerCustomVizPlugin
    >[0];
  };
  const factory = globals.__customVizPlugin__;
  globals.__customVizPlugin__ = undefined;
  if (typeof factory !== "function") {
    throw new Error(
      `Custom viz plugin "${identifier}" did not assign a factory function to __customVizPlugin__ (got ${typeof factory}).`,
    );
  }
  registerCustomVizPlugin(factory, identifier, pluginId);
}

export function clearCustomVizRegistrations() {
  PLUGIN_CUSTOM_VIZ.customVizRegistry.clear();
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
