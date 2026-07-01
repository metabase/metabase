import React from "react";
import * as jsxRuntime from "react/jsx-runtime";

// Deep import (not the metabase/plugins barrel) so the static-viz bundles don't
// drag the whole app UI stack in via the barrel's other plugin modules.
import { PLUGIN_CUSTOM_VIZ_STATIC } from "metabase/plugins/oss/custom-viz-static";
import type { RenderChartOptions } from "metabase/static-viz/types";
import MetabaseSettings from "metabase/utils/settings";
import { formatValue as internalFormatValue } from "metabase/visualizations/lib/formatting/value";
import { extendCardWithDashcardSettings } from "metabase/visualizations/lib/settings/typed-utils";
import { customVizColumnTypes } from "metabase-lib/v1/types/utils/custom-viz-column-types";
import type {
  ColumnSettings,
  DashCardVisualizationSettings,
  RawSeries,
  SettingKey,
} from "metabase-types/api";

type StaticVizApiWindow = Omit<Window, "__METABASE_VIZ_API__"> & {
  __METABASE_VIZ_API__?: Omit<
    NonNullable<Window["__METABASE_VIZ_API__"]>,
    // unsupported in static viz
    "measureText" | "measureTextHeight" | "measureTextWidth"
  >;
};

type EnterpriseOverrides = (() => void) | undefined;

export type { RenderChartOptions };

/**
 * Expose React, jsxRuntime, and utils for custom viz bundles that reference
 * window.__METABASE_VIZ_API__ via the metabaseVizExternals Vite plugin.
 */
export function installStaticVizApi() {
  // Cast: the static-viz API surface here deliberately omits the measureText*
  // members of Window["__METABASE_VIZ_API__"] (unsupported in static viz).
  (window as StaticVizApiWindow).__METABASE_VIZ_API__ = {
    React,
    jsxRuntime,
    columnTypes: customVizColumnTypes,
    formatValue: (value: unknown, options?: ColumnSettings) => {
      const result = internalFormatValue(value, { ...options, jsx: false });
      return String(result ?? "");
    },
  };
}

/**
 * Initialize the static viz context: set settings and apply enterprise overrides.
 * Must be called before registerCustomVizPlugin so that the EE registry is active.
 */
export function initializeStaticVizContext(
  options: RenderChartOptions,
  enterpriseOverrides: EnterpriseOverrides,
) {
  MetabaseSettings.set("token-features", options.tokenFeatures);
  MetabaseSettings.set(
    // Unjustified type cast. FIXME
    "application-colors" as SettingKey,
    options.applicationColors,
  );
  MetabaseSettings.set("custom-formatting", options.customFormatting);
  MetabaseSettings.set("site-locale", options.locale ?? "en");

  if (typeof enterpriseOverrides === "function") {
    enterpriseOverrides();
  }
}

export function applyRenderChartSettings(
  options: RenderChartOptions,
  enterpriseOverrides: EnterpriseOverrides,
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

export function registerCustomVizPlugin(
  factory: Parameters<
    typeof PLUGIN_CUSTOM_VIZ_STATIC.registerCustomVizPlugin
  >[0],
  identifier: string,
) {
  PLUGIN_CUSTOM_VIZ_STATIC.registerCustomVizPlugin(factory, identifier);
}
