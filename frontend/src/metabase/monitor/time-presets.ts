import { match } from "ts-pattern";
import { t } from "ttag";

import type { QueryParam } from "metabase/common/hooks/use-url-state";
import { getFirstParamValue } from "metabase/common/hooks/use-url-state";
import { dayjs } from "metabase/dayjs";

export const MONITOR_TIME_PRESETS = ["hour", "day", "week", "month"] as const;
export type MonitorTimePreset = (typeof MONITOR_TIME_PRESETS)[number];

export const isTimePreset = (value: string): value is MonitorTimePreset =>
  MONITOR_TIME_PRESETS.some((preset) => preset === value);

export const parseTimePreset = (
  param: QueryParam,
): MonitorTimePreset | null => {
  const value = getFirstParamValue(param);
  return typeof value === "string" && isTimePreset(value) ? value : null;
};

export const getTimePresetCutoff = (
  preset: MonitorTimePreset | null,
): string | undefined =>
  preset === null ? undefined : dayjs().subtract(1, preset).toISOString();

export const getTimePresetLabel = (preset: MonitorTimePreset): string =>
  match(preset)
    .with("hour", () => t`Past hour`)
    .with("day", () => t`Past day`)
    .with("week", () => t`Past week`)
    .with("month", () => t`Past month`)
    .exhaustive();

export const toTimePreset = (value: string | null): MonitorTimePreset | null =>
  value !== null && isTimePreset(value) ? value : null;

export const getTimePresetOptions = (): {
  value: MonitorTimePreset;
  label: string;
}[] =>
  MONITOR_TIME_PRESETS.map((preset) => ({
    value: preset,
    label: getTimePresetLabel(preset),
  }));
