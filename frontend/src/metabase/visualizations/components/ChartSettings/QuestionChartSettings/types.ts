import type { BaseChartSettingsProps } from "../BaseChartSettings/types";
import type {
  BaseChartSettingsTestProps,
  CommonChartSettingsProps,
} from "../types";

export type QuestionChartSettingsProps = CommonChartSettingsProps &
  Pick<BaseChartSettingsProps, "initial" | "computedSettings" | "question"> &
  BaseChartSettingsTestProps;
