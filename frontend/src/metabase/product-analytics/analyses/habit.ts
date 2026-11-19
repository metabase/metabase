import { t } from "ttag";

import { getCommonSettings } from "./common-settings";
import { getAxisTitleSettings, getSeriesSettings } from "./series-settings";
import type { AnalysisConfig } from "./types";

/** The planner's result columns. */
const PERIODS_COLUMN = "periods";
const PEOPLE_COLUMN = "people";

export const HABIT_CONFIG: AnalysisConfig<"habit"> = {
  settings: getCommonSettings({
    grains: ["person"],
    granularities: ["day", "week"],
  }),
  getTitle: ({ granularity }) =>
    granularity === "week"
      ? t`How many weeks did people show up?`
      : t`How many days did people show up?`,
  getDisplay: () => "bar",
  getVizSettings: ({ granularity }) => ({
    "graph.dimensions": [PERIODS_COLUMN],
    "graph.metrics": [PEOPLE_COLUMN],
    ...getSeriesSettings(PEOPLE_COLUMN, t`People`),
    ...getAxisTitleSettings({
      x: granularity === "week" ? t`Weeks active` : t`Days active`,
      y: t`People`,
    }),
  }),
};
