import type { ScheduleSettings } from "metabase-types/api";

import type { AM, PM } from "./constants";
import type {
  CronString,
  NormalizedScheduleValue,
  ScheduleField,
} from "./domain";

type ScheduleProperty = keyof ScheduleSettings;
export type ScheduleChangeProp = { name: ScheduleProperty; value: unknown };

export type AmPm = typeof AM | typeof PM;

export type ScheduleChangeEvent = {
  value: NormalizedScheduleValue;
  /** Null while a required field is unpicked, rather than a cron with invented
   * values. */
  cronString: CronString | null;
};

export type UpdateSchedule = <TField extends ScheduleField>(
  field: TField,
  value: Exclude<ScheduleSettings[TField], undefined>,
) => void;
