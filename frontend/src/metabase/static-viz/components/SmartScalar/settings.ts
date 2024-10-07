import { getCommonStaticVizSettings } from "metabase/static-viz/lib/settings";
import { getDefaultColumn } from "metabase/visualizations/lib/settings/utils";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import { VIZ_SETTINGS_DEFAULTS } from "metabase/visualizations/visualizations/SmartScalar/constants";
import {
  getComparisons,
  getDefaultComparison,
  isSuitableScalarColumn,
} from "metabase/visualizations/visualizations/SmartScalar/utils";
import type { RawSeries } from "metabase-types/api";

export const computeSmartScalarSettings = (
  rawSeries: RawSeries,
): ComputedVisualizationSettings => {
  const settings = getCommonStaticVizSettings(rawSeries);

  settings["scalar.field"] ??= getDefaultColumn(
    rawSeries,
    settings,
    isSuitableScalarColumn,
  );

  settings["scalar.comparisons"] ??= getDefaultComparison(rawSeries, settings);
  settings["scalar.comparisons"] = getComparisons(rawSeries, settings);

  settings["scalar.switch_positive_negative"] ??=
    VIZ_SETTINGS_DEFAULTS["scalar.switch_positive_negative"];

  settings["scalar.compact_primary_number"] ??=
    VIZ_SETTINGS_DEFAULTS["scalar.compact_primary_number"];

  return settings;
};
