import { t } from "ttag";

import { isOneOf } from "metabase-types/guards";

import { getCommonSettings } from "./common-settings";
import { getAxisTitleSettings, getSeriesSettings } from "./series-settings";
import type {
  AnalysisConfig,
  AnalysisSettingDefinitions,
  CommonSettingsOptions,
  HabitSettings,
  HabitValues,
} from "./types";

/** The planner's result columns. */
const PERIODS_COLUMN = "periods";
const PEOPLE_COLUMN = "people";

const HABIT_OPTIONS: CommonSettingsOptions = {
  grains: ["person"],
  granularities: ["day", "week"],
};

const HABIT_VALUES_OPTIONS: readonly HabitValues[] = ["count", "percent"];

const COMMON_SETTINGS = getCommonSettings(
  HABIT_OPTIONS,
) as unknown as AnalysisSettingDefinitions<HabitSettings>;

export const HABIT_CONFIG: AnalysisConfig<"habit"> = {
  options: HABIT_OPTIONS,
  settings: {
    ...COMMON_SETTINGS,
    habit_values: {
      getDefault: () => "count",
      isValid: (_context, settings) =>
        isOneOf(HABIT_VALUES_OPTIONS, settings.habit_values),
    },
  },
  getTitle: ({ granularity }) =>
    granularity === "week"
      ? t`How many weeks did people show up?`
      : t`How many days did people show up?`,
  getDisplay: () => "bar",
  getVizSettings: ({ granularity, habit_values }) => ({
    "graph.dimensions": [PERIODS_COLUMN],
    "graph.metrics": [PEOPLE_COLUMN],
    ...getSeriesSettings(PEOPLE_COLUMN, t`People`),
    ...getAxisTitleSettings({
      x: granularity === "week" ? t`Weeks active` : t`Days active`,
      y: habit_values === "percent" ? t`Percent of people` : t`People`,
    }),
    ...(habit_values === "percent" && {
      column_settings: {
        [`["name","${PEOPLE_COLUMN}"]`]: {
          number_style: "percent",
          decimals: 1,
        },
      },
    }),
  }),
};
