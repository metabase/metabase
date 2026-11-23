import { isOneOf } from "metabase-types/guards";

import { parseDateRange } from "../date-range";

import type {
  AnalysisSettingDefinitions,
  CommonSettings,
  CommonSettingsOptions,
} from "./types";

const DEFAULT_DATE_RANGE = "past90days";

/** The settings every analysis has, with the options its kind allows. */
export const getCommonSettings = ({
  grains,
  granularities,
}: CommonSettingsOptions): AnalysisSettingDefinitions<CommonSettings> => ({
  date_range: {
    getDefault: () => DEFAULT_DATE_RANGE,
    isValid: (_context, settings) =>
      parseDateRange(settings.date_range) !== undefined,
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
