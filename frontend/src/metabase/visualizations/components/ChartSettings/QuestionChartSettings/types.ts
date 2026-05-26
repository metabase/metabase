import type { BaseChartSettingsProps } from "../BaseChartSettings/types";
import type { CommonChartSettingsProps } from "../types";

export type QuestionChartSettingsProps = CommonChartSettingsProps &
  Pick<BaseChartSettingsProps, "initial" | "computedSettings" | "question">;
