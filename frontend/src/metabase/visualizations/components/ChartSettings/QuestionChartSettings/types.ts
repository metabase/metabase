import type { BaseChartSettingsProps } from "../BaseChartSettings/types";
import type { CommonChartSettingsProps, Widget } from "../types";

export type QuestionChartSettingsProps = {
  widgets?: Widget[];
} & CommonChartSettingsProps &
  Pick<BaseChartSettingsProps, "initial" | "computedSettings" | "question">;
