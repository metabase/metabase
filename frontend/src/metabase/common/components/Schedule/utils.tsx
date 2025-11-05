import type { ReactNode } from "react";
import { match } from "ts-pattern";
import _ from "underscore";

import { measureTextWidth } from "metabase/lib/measure-text";
import type { SelectProps } from "metabase/ui";
import type { FontStyle } from "metabase/visualizations/shared/types/measure-text";
import type { ScheduleSettings } from "metabase-types/api";

import { defaultDay, defaultHour } from "./constants";

export const combineConsecutiveStrings = (arr: ReactNode[]) => {
  return arr.reduce<ReactNode[]>((acc, node) => {
    const previousNode = acc.at(-1);
    if (typeof node === "string" && typeof previousNode === "string") {
      return [...acc.slice(0, acc.length - 1), previousNode + ` ${node}`];
    }
    if (typeof node === "string" && !node.trim()) {
      return acc;
    }
    return [...acc, typeof node === "string" ? node.trim() : node];
  }, []);
};

export const getLongestSelectLabel = (
  data: SelectProps["data"] | { value: string }[] = [],
  fontFamily?: string,
): string => {
  const width = (str: string) =>
    measureTextWidthSafely(str, str.length, { family: fontFamily });
  return [...data].reduce<string>((acc: string, option) => {
    let label: string;
    if (typeof option === "string") {
      label = option;
    } else if (!option) {
      label = "";
    } else if ("label" in option) {
      label = option.label;
    } else if ("group" in option) {
      label = getLongestSelectLabel(option.items);
    } else {
      label = "";
    }
    return width(label) > width(acc) ? label : acc;
  }, "");
};

/** Since measureTextWidth can throw an error, this function catches the error and returns a default width
 *
 * Note that you may want to set the style prop to reflect the currently chosen font family, like this:
 * ```
 *    const fontFamily = useSelector(state => getSetting(state, "application-font"));
 *    measureTextWidthSafely("string", 50, {family: fontFamily});
 * ```
 * */
export const measureTextWidthSafely = _.memoize(
  (text: string, defaultWidth: number, style?: Partial<FontStyle>) => {
    try {
      return measureTextWidth(text, style);
    } catch (e) {
      console.error(`Error while measuring text width:`, e);
      return defaultWidth;
    }
  },
  function hashFunction(...args) {
    return JSON.stringify(args);
  },
);

export const getScheduleDefaults = (
  schedule: ScheduleSettings,
): ScheduleSettings => {
  return match<ScheduleSettings>(schedule)
    .with({ schedule_type: "every_n_minutes" }, () => ({
      schedule_day: null,
      schedule_frame: null,
      schedule_hour: null,
      schedule_minute: 10,
    }))
    .with({ schedule_type: "hourly" }, () => ({
      schedule_day: null,
      schedule_frame: null,
      schedule_hour: null,
      schedule_minute: 0,
    }))
    .with({ schedule_type: "daily" }, () => ({
      schedule_day: null,
      schedule_frame: null,
      schedule_hour: defaultHour,
      schedule_minute: 0,
    }))
    .with({ schedule_type: "weekly" }, () => ({
      schedule_day: defaultDay,
      schedule_frame: null,
      schedule_hour: defaultHour,
      schedule_minute: 0,
    }))
    .with({ schedule_type: "monthly", schedule_frame: "mid" }, () => ({
      schedule_day: null,
      schedule_frame: "mid",
      schedule_hour: defaultHour,
      schedule_minute: 0,
    }))
    .with({ schedule_type: "monthly" }, () => ({
      schedule_frame: "first",
      schedule_hour: defaultHour,
      schedule_minute: 0,
    }))
    .with({ schedule_type: "cron" }, () => ({
      schedule_day: null,
      schedule_frame: null,
      schedule_hour: defaultHour,
      schedule_minute: 0,
    }))
    .otherwise(() => ({}));
};
