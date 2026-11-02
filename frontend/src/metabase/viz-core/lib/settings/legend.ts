import { t } from "ttag";

import {
  LEGEND_POSITIONS,
  type LegendPosition,
  type Series,
} from "metabase-types/api";
import { isLegendPosition } from "metabase-types/guards";

import type {
  ComputedVisualizationSettings,
  SeriesSettingDefinition,
  VisualizationSettingsDefinitions,
} from "../../types";

const LEGEND_POSITION_LABELS: Record<LegendPosition, () => string> = {
  auto: () => t`Auto`,
  top: () => t`Top`,
  bottom: () => t`Bottom`,
  left: () => t`Left`,
  right: () => t`Right`,
  off: () => t`Off`,
};

export const DEFAULT_LEGEND_POSITION: LegendPosition = "auto";

export const getLegendPositionSetting = (
  overrides: Pick<
    SeriesSettingDefinition,
    "getDefault" | "getHidden" | "readDependencies"
  > = {},
): SeriesSettingDefinition => ({
  getSection: () => t`Display`,
  get title() {
    return t`Legend position`;
  },
  widget: "select",
  getDefault: () => DEFAULT_LEGEND_POSITION,
  isValid: (_series, settings) => isLegendPosition(settings["legend.position"]),
  getProps: () => ({
    options: LEGEND_POSITIONS.map((value) => ({
      name: LEGEND_POSITION_LABELS[value](),
      value,
    })),
  }),
  ...overrides,
});

const hasSingleSeries = (
  series: Series,
  settings: ComputedVisualizationSettings,
) =>
  series.length <= 1 &&
  (settings["graph.dimensions"]?.length ?? 0) <= 1 &&
  (settings["graph.metrics"]?.length ?? 0) <= 1;

export const LEGEND_POSITION_SETTINGS: VisualizationSettingsDefinitions = {
  "legend.position": getLegendPositionSetting({
    getHidden: hasSingleSeries,
    readDependencies: ["graph.dimensions", "graph.metrics"],
  }),
};
