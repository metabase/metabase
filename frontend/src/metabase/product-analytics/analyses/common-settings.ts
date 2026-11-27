import * as Lib from "metabase-lib";
import { isOneOf } from "metabase-types/guards";

import { getTableQuery, readBaseQuery } from "../base-query";
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
  base_query: {
    getDefault: ({ table, metadataProvider }) =>
      Lib.toJsQuery(getTableQuery(metadataProvider, table.id)),
    isValid: ({ metadataProvider }, settings) =>
      readBaseQuery(metadataProvider, settings.base_query) !== null,
  },
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
