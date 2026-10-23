import { t } from "ttag";

import {
  COMBO_CHARTS_SETTINGS_DEFINITIONS,
  getCartesianChartDefinition,
} from "metabase/visualizations/visualizations/CartesianChart/definition";
import {
  type ComputedVisualizationSettings,
  type SettingsExtra,
  type VisualizationDefinition,
  type VisualizationSettingsDefinitions,
  getDefaultSize,
  getMinSize,
} from "metabase/viz-core";
import type { Series } from "metabase-types/api";

// What the product analytics funnel steps chart doesn't draw. The settings
// for how values look follow "graph.show_values", so they hide with it.
const FUNNEL_STEPS_UNSUPPORTED_SETTINGS = [
  "graph.show_goal",
  "graph.goal_value",
  "graph.goal_label",
  "graph.show_trendline",
  "graph.show_values",
  "graph.label_value_formatting",
  "graph.show_stack_values",
  "stackable.stack_type",
] as const;

// Funnel steps' own tooltip is shown whether or not the steps are drawn.
const FUNNEL_STEPS_TOOLTIP_SETTINGS = ["graph.tooltip_columns"] as const;

type FunnelStepsHiddenSetting =
  | (typeof FUNNEL_STEPS_UNSUPPORTED_SETTINGS)[number]
  | (typeof FUNNEL_STEPS_TOOLTIP_SETTINGS)[number];

/**
 * Whether the bars draw as funnel steps: with one series, or a chart per
 * series. Side by side, they're plain grouped bars.
 */
const isDrawingFunnelSteps = (
  series: Series,
  settings: ComputedVisualizationSettings,
) =>
  settings["product_analytics.funnel_steps"] === true &&
  (series.length === 1 || settings["graph.split_panels"] === true);

/** The settings, with the ones funnel steps don't draw hidden for them. */
const withFunnelStepsHidden = (
  definitions: VisualizationSettingsDefinitions,
): VisualizationSettingsDefinitions => {
  const hidden: VisualizationSettingsDefinitions = {};
  const hideWhen = (
    ids: readonly FunnelStepsHiddenSetting[],
    isHidden: (
      series: Series,
      settings: ComputedVisualizationSettings,
    ) => boolean,
  ) => {
    for (const id of ids) {
      const definition = definitions[id];
      if (definition !== undefined) {
        hidden[id] = {
          ...definition,
          getHidden: (
            series: Series,
            settings: ComputedVisualizationSettings,
            extra?: SettingsExtra,
          ) =>
            isHidden(series, settings) ||
            (definition.getHidden?.(series, settings, extra) ?? false),
        };
      }
    }
  };
  hideWhen(FUNNEL_STEPS_UNSUPPORTED_SETTINGS, isDrawingFunnelSteps);
  hideWhen(
    FUNNEL_STEPS_TOOLTIP_SETTINGS,
    (_series, settings) => settings["product_analytics.funnel_steps"] === true,
  );
  return { ...definitions, ...hidden };
};

const BarViz: Omit<VisualizationDefinition, "isSensible" | "checkRenderable"> =
  {
    getUiName: () => t`Bar`,
    identifier: "bar",
    iconName: "bar",
    get noun() {
      return t`bar chart`;
    },
    minSize: getMinSize("bar"),
    defaultSize: getDefaultSize("bar"),
    settings: {
      ...withFunnelStepsHidden(COMBO_CHARTS_SETTINGS_DEFINITIONS),
      // Set by the product analytics funnel; has no widget
      "product_analytics.funnel_steps": {
        getDefault: () => false,
      },
      "product_analytics.funnel_step_colors": {
        getDefault: () => [],
      },
    },
  };

export const BAR_CHART_DEFINITION = getCartesianChartDefinition(BarViz);
