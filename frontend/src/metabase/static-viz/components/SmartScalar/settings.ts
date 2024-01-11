import type { RawSeries, VisualizationSettings } from "metabase-types/api";
import { getCommonStaticVizSettings } from "metabase/static-viz/lib/settings";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
// import { getDefaultComparison } from "metabase/visualizations/visualizations/SmartScalar/utils";

export const computeSmartScalarSettings = (
  rawSeries: RawSeries,
  dashcardSettings: VisualizationSettings,
): ComputedVisualizationSettings => {
  const settings = getCommonStaticVizSettings(rawSeries, dashcardSettings);
  // TODO: compute defaults but make sure it does not import code that can't be executed in GraalVM
  // settings["scalar.comparisons"] ??= getDefaultComparison(rawSeries, settings);
  return settings;
};
