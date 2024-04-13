import type { ReactNode } from "react";
import { useCallback, Children, isValidElement } from "react";
import { c } from "ttag";

import {
  getLongestSelectLabel,
  removeNilValues,
} from "metabase/admin/performance/utils";
import { capitalize } from "metabase/lib/formatting/strings";
import { Box, Group } from "metabase/ui";
import type { ScheduleSettings, ScheduleType } from "metabase-types/api";

import {
  AutoWidthSelect,
  SelectFrame,
  SelectMinute,
  SelectTime,
  SelectWeekday,
  SelectWeekdayOfMonth,
} from "./components";
import {
  defaultDay,
  defaultHour,
  frames,
  optionNameTranslations,
  weekdayOfMonthOptions,
} from "./constants";
import type { ScheduleChangeProp, UpdateSchedule } from "./types";

type ScheduleProperty = keyof ScheduleSettings;

const getOptionName = (option: ScheduleType) =>
  optionNameTranslations[option] || capitalize(option);

export interface ScheduleProps {
  schedule: ScheduleSettings;
  scheduleOptions: ScheduleType[];
  onScheduleChange: (
    nextSchedule: ScheduleSettings,
    change: ScheduleChangeProp,
  ) => void;
  timezone?: string;
  verb?: string;
  textBeforeSendTime?: string;
  minutesOnHourPicker?: boolean;
}

const defaults: Record<string, Partial<ScheduleSettings>> = {
  hourly: {
    schedule_day: null,
    schedule_frame: null,
    schedule_hour: null,
    schedule_minute: 0,
  },
  daily: {
    schedule_day: null,
    schedule_frame: null,
    schedule_hour: defaultHour,
    schedule_minute: 0,
  },
  weekly: {
    schedule_day: defaultDay,
    schedule_frame: null,
    schedule_minute: 0,
  },
  monthly: {
    schedule_frame: "first",
    schedule_day: defaultDay,
    schedule_minute: 0,
  },
};

export const Schedule = ({
  schedule,
  scheduleOptions,
  timezone,
  verb,
  textBeforeSendTime,
  minutesOnHourPicker,
  onScheduleChange,
}: {
  schedule: ScheduleSettings;
  scheduleOptions: ScheduleType[];
  timezone?: string;
  verb?: string;
  textBeforeSendTime?: string;
  minutesOnHourPicker?: boolean;
  onScheduleChange: (
    nextSchedule: ScheduleSettings,
    change: ScheduleChangeProp,
  ) => void;
}) => {
  const updateSchedule: UpdateSchedule = useCallback(
    (field: ScheduleProperty, value: ScheduleSettings[typeof field]) => {
      let newSchedule: ScheduleSettings = {
        ...schedule,
        [field]: value,
      };

      newSchedule = removeNilValues(newSchedule);

      if (field === "schedule_type") {
        newSchedule = {
          ...newSchedule,
          ...defaults[value as ScheduleType],
        };
      } else if (field === "schedule_frame") {
        // when the monthly schedule frame is the 15th, clear out the schedule_day
        if (value === "mid") {
          newSchedule = { ...newSchedule, schedule_day: null };
        } else {
          // first or last, needs a day of the week
          newSchedule = {
            schedule_day: newSchedule.schedule_day || defaultDay,
            ...newSchedule,
          };
        }
      }

      onScheduleChange(newSchedule, { name: field, value });
    },
    [onScheduleChange, schedule],
  );

  return (
    <Box
      lh="40px"
      display="grid"
      style={{
        gridTemplateColumns: "fit-content(100%) auto",
        gap: ".5rem",
      }}
    >
      <ScheduleBody
        schedule={schedule}
        updateSchedule={updateSchedule}
        scheduleOptions={scheduleOptions}
        timezone={timezone}
        verb={verb}
        textBeforeSendTime={textBeforeSendTime}
        minutesOnHourPicker={minutesOnHourPicker}
      />
    </Box>
  );
};

const ScheduleBody = ({
  schedule,
  updateSchedule,
  scheduleOptions,
  timezone,
  verb,
  minutesOnHourPicker,
}: Omit<ScheduleProps, "onScheduleChange"> & {
  updateSchedule: UpdateSchedule;
}) => {
  const itemProps = {
    schedule,
    updateSchedule,
  };
  const frequencyProps = {
    ...itemProps,
    key: "frequency",
    scheduleType: schedule.schedule_type,
    scheduleOptions,
  };
  const timeProps = {
    ...itemProps,
    timezone,
    key: "time",
  };
  const minuteProps = {
    ...itemProps,
    key: "minute",
  };
  const weekdayProps = {
    ...itemProps,
    key: "weekday",
  };
  const frameProps = {
    ...itemProps,
    key: "frame",
    longestLabel: getLongestSelectLabel(frames),
  };
  const weekdayOfMonthProps = {
    ...itemProps,
    key: "weekday-of-month",
    longestLabel: getLongestSelectLabel(weekdayOfMonthOptions),
  };

  const scheduleType = schedule.schedule_type;
  if (scheduleType === "hourly") {
    if (minutesOnHourPicker) {
      // e.g. "Send hourly at 15 minutes past the hour"
      return (
        <TwoColumns>{c(
          "{0} is a verb like 'Send', {1} is an adverb like 'hourly', {2} is a number of minutes",
        ).jt`${verb} ${(<SelectFrequency {...frequencyProps} />)} at ${(
          <SelectMinute {...minuteProps} />
        )} minutes past the hour`}</TwoColumns>
      );
    } else {
      // e.g. "Send hourly"
      return (
        <TwoColumns>
          {c("{0} is a verb like 'Send', {1} is an adverb like 'hourly'")
            .jt`${verb} ${(<SelectFrequency {...frequencyProps} />)}`}
        </TwoColumns>
      );
    }
  } else if (scheduleType === "daily") {
    // e.g. "Send daily at 12:00pm"
    return (
      <TwoColumns>
        {c(
          "{0} is a verb like 'Send', {1} is an adverb like 'hourly', {2} is a time like '12:00pm'",
        ).jt`${verb} ${(<SelectFrequency {...frequencyProps} />)} at ${(
          <SelectTime {...timeProps} />
        )}`}
      </TwoColumns>
    );
  } else if (scheduleType === "weekly") {
    // e.g. "Send weekly on Tuesday at 12:00pm"
    return (
      <TwoColumns>
        {c(
          "{0} is a verb like 'Send', {1} is an adverb like 'hourly', {2} is a day like 'Tuesday', {3} is a time like '12:00pm'",
        ).jt`${verb} ${(<SelectFrequency {...frequencyProps} />)} on ${(
          <SelectWeekday {...weekdayProps} />
        )} at ${(<SelectTime {...timeProps} />)}`}
      </TwoColumns>
    );
  } else if (scheduleType === "monthly") {
    // e.g. "Send monthly on the 15th at 12:00pm"
    if (schedule.schedule_frame === "mid") {
      return (
        <TwoColumns>
          {c(
            "{0} is a verb like 'Send', {1} is an adverb like 'hourly', {2} is the noun '15th' (as in 'the 15th of the month'), {3} is a time like '12:00pm'",
          ).jt`${verb} ${(<SelectFrequency {...frequencyProps} />)} on the ${(
            <SelectFrame {...frameProps} />
          )} at ${(<SelectTime {...timeProps} />)}`}
        </TwoColumns>
      );
    } else {
      // e.g. "Send monthly on the first Tuesday at 12:00pm"
      return (
        <TwoColumns>
          {c(
            "{0} is a verb like 'Send', {1} is an adverb like 'hourly', {2} is an adjective like 'first', {3} is a day like 'Tuesday', {4} is a time like '12:00pm'",
          ).jt`${verb} ${(<SelectFrequency {...frequencyProps} />)} on the ${(
            <SelectFrame {...frameProps} />
          )} ${(<SelectWeekdayOfMonth {...weekdayOfMonthProps} />)} at ${(
            <SelectTime {...timeProps} />
          )}`}
        </TwoColumns>
      );
    }
  } else {
    return null;
  }
};

/** Arrange Schedule components into two columns. */
const TwoColumns = ({ children }: { children: ReactNode }) => {
  const kids = Children.toArray(children).filter(
    child => !(typeof child === "string" && !child.trim()),
  );
  const result: ReactNode[] = [];
  const addBlank = () => result.push(<Box></Box>);
  for (let c = 0; c < kids.length; c++) {
    const curr = kids[c];
    const next = kids[c + 1];
    const isLastItemString = c === kids.length - 1 && typeof curr === "string";
    if (isLastItemString) {
      addBlank();
      result.push(<Box mt="-.5rem">{curr}</Box>);
    } else {
      const isFirstItemString = c === 0 && typeof curr !== "string";
      if (isFirstItemString) {
        addBlank();
      }
      if (typeof curr === "string") {
        const wrappedCurr = <Box style={{ textAlign: "end" }}>{curr}</Box>;
        result.push(wrappedCurr);
      } else {
        result.push(curr);
      }
    }
    // Insert blank nodes between adjacent Selects unless they can fit on one line
    if (isValidElement(curr) && isValidElement(next)) {
      const canSelectsProbablyFitOnOneLine =
        curr.props.longestLabel.length + next.props.longestLabel.length < 19;
      if (canSelectsProbablyFitOnOneLine) {
        result[c] = (
          <Group spacing="xs">
            {result[c]}
            {next}
          </Group>
        );
        c++;
      } else {
        addBlank();
      }
    }
  }
  return <>{result}</>;
};

/** A Select that changes the schedule frequency (e.g., daily, hourly, monthly, etc.),
 * also known as the schedule 'type'. */
const SelectFrequency = ({
  scheduleType,
  updateSchedule,
  scheduleOptions,
}: {
  scheduleType?: ScheduleType | null;
  updateSchedule: UpdateSchedule;
  scheduleOptions: ScheduleType[];
}) => {
  const scheduleTypeOptions = scheduleOptions.map(option => ({
    label: getOptionName(option),
    value: option,
  }));

  return (
    <AutoWidthSelect
      display="flex"
      value={scheduleType}
      onChange={(value: ScheduleType) => updateSchedule("schedule_type", value)}
      data={scheduleTypeOptions}
    />
  );
};
