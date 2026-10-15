import { t } from "ttag";

import type { LegendPosition, Series } from "metabase-types/api";

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

export const isLegendPosition = (value: unknown): value is LegendPosition =>
  typeof value === "string" && Object.hasOwn(LEGEND_POSITION_LABELS, value);

type LegendPositionOption = { name: string; value: LegendPosition };

const getLegendPositionOptions = (): LegendPositionOption[] =>
  Object.entries(LEGEND_POSITION_LABELS).map(([value, getLabel]) => ({
    name: getLabel(),
    // Object.entries widens the key to string; the record is keyed by the enum.
    value: value as LegendPosition,
  }));

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
  getProps: () => ({ options: getLegendPositionOptions() }),
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
