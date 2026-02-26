import type { Widget } from "metabase-types/api";

import type { BaseChartSettingsProps } from "../BaseChartSettings/types";
import type { CommonChartSettingsProps } from "../types";

export type QuestionChartSettingsProps = {
  widgets?: Widget[];
} & CommonChartSettingsProps &
  Pick<BaseChartSettingsProps, "initial" | "computedSettings" | "question">;
