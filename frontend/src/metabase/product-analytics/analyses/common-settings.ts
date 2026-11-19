import { deserializeDateParameterValue } from "metabase/querying/parameters/utils/parsing";
import { isOneOf } from "metabase-types/guards";

import type {
  AnalysisSettingDefinitions,
  CommonSettings,
  Grain,
  Granularity,
} from "./types";

const DEFAULT_DATE_RANGE = "past90days";

/**
 * Whether a value is a relative or specific date range, in the format
 * dashboard date filters use.
 */
const isDateRange = (value: unknown): boolean => {
  if (typeof value !== "string") {
    return false;
  }
  const type = deserializeDateParameterValue(value)?.type;
  return type === "relative" || type === "specific";
};

type CommonSettingsOptions = {
  /** What the analysis can count. The first is the default. */
  grains: readonly [Grain, ...Grain[]];
  /** The time units the analysis can bucket by. The first is the default. */
  granularities: readonly [Granularity, ...Granularity[]];
};

/** The settings every analysis has, with the options its kind allows. */
export const getCommonSettings = ({
  grains,
  granularities,
}: CommonSettingsOptions): AnalysisSettingDefinitions<CommonSettings> => ({
  date_range: {
    getDefault: () => DEFAULT_DATE_RANGE,
    isValid: (_context, settings) => isDateRange(settings.date_range),
  },
  counting: {
    getDefault: () => grains[0],
    isValid: (_context, settings) => isOneOf(grains, settings.counting),
  },
  granularity: {
    getDefault: () => granularities[0],
    isValid: (_context, settings) =>
      isOneOf(granularities, settings.granularity),
  },
});
