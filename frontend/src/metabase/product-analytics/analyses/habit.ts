import { getCommonSettings } from "./common-settings";
import type { AnalysisConfig } from "./types";

export const HABIT_CONFIG: AnalysisConfig<"habit"> = {
  settings: getCommonSettings({
    grains: ["person"],
    granularities: ["day", "week"],
  }),
};
