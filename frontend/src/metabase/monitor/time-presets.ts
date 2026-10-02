import { match } from "ts-pattern";
import { t } from "ttag";

import type { QueryParam } from "metabase/common/hooks/use-url-state";
import { getFirstParamValue } from "metabase/common/hooks/use-url-state";
import { dayjs } from "metabase/dayjs";

/**
 * The relative time windows a Monitor list page offers as a filter preset: "registered in the past hour", "last
 * active in the past week". Shared by the Sessions and OAuth clients pages, which both turn a preset into the
 * `*-after` bound of a half-open range rather than exposing a date picker.
 */
export const MONITOR_TIME_PRESETS = ["hour", "day", "week", "month"] as const;
export type MonitorTimePreset = (typeof MONITOR_TIME_PRESETS)[number];

export const isTimePreset = (value: string): value is MonitorTimePreset =>
  MONITOR_TIME_PRESETS.some((preset) => preset === value);

/** The preset a URL names, or nothing. */
export const parseTimePreset = (
  param: QueryParam,
): MonitorTimePreset | null => {
  // An unrecognised preset is dropped rather than sent on: the endpoint would reject the whole request, taking the
  // rest of the filters down with it.
  const value = getFirstParamValue(param);
  return typeof value === "string" && isTimePreset(value) ? value : null;
};

/** The instant a preset's window opens, as the `*-after` bound the endpoints take, or nothing for no preset. */
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
