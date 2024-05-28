/* eslint-disable react/prop-types */
import { t } from "ttag";

import { parseTime } from "metabase/lib/time";

import DatePicker, {
  getDateTimeFieldTarget,
} from "../LegacyDatePicker/DatePicker";
import HoursMinutesInput from "../LegacyDatePicker/HoursMinutesInput";

import {
  TimePickerRoot,
  BetweenConnector,
  MultiTimePickerRoot,
} from "./TimePicker.styled";

const TimeInput = ({ value, onChange }) => {
  const time = parseTime(value);
  return (
    <HoursMinutesInput
      hours={time.hour()}
      minutes={time.minute()}
      onChangeHours={hours => onChange(time.hour(hours).format("HH:mm:00.000"))}
      onChangeMinutes={minutes =>
        onChange(time.minute(minutes).format("HH:mm:00.000"))
      }
    />
  );
};

const SingleTimePicker = ({ filter, onFilterChange }) => (
  <TimeInput
    value={getTime(filter[2])}
    onChange={time => onFilterChange([filter[0], filter[1], time])}
  />
);

SingleTimePicker.horizontalLayout = true;

const MultiTimePicker = ({ filter, onFilterChange }) => (
  <MultiTimePickerRoot>
    <TimeInput
      value={getTime(filter[2])}
      onChange={time =>
        onFilterChange([filter[0], filter[1], ...sortTimes(time, filter[3])])
      }
    />
    <BetweenConnector>{t`and`}</BetweenConnector>
    <TimeInput
      value={getTime(filter[3])}
      onChange={time =>
        onFilterChange([filter[0], filter[1], ...sortTimes(filter[2], time)])
      }
    />
  </MultiTimePickerRoot>
);

const sortTimes = (a, b) => {
  return parseTime(a).isAfter(parseTime(b)) ? [b, a] : [a, b];
};

const getTime = value => {
  if (
    typeof value === "string" &&
    /^\d+:\d+(:\d+(.\d+(\+\d+:\d+)?)?)?$/.test(value)
  ) {
    return value;
  } else {
    return "00:00:00.000+00:00";
  }
};

export const TIME_OPERATORS = [
  {
    name: "before",
    displayName: t`Before`,
    init: filter => [
      "<",
      getDateTimeFieldTarget(filter[1]),
      getTime(filter[2]),
    ],
    test: ([op]) => op === "<",
    widget: SingleTimePicker,
  },
  {
    name: "after",
    displayName: t`After`,
    init: filter => [
      ">",
      getDateTimeFieldTarget(filter[1]),
      getTime(filter[2]),
    ],
    test: ([op]) => op === ">",
    widget: SingleTimePicker,
  },
  {
    name: "between",
    displayName: t`Between`,
    init: filter => [
      "between",
      getDateTimeFieldTarget(filter[1]),
      getTime(filter[2]),
      getTime(filter[3]),
    ],
    test: ([op]) => op === "between",
    widget: MultiTimePicker,
  },
];

const TimePicker = props => (
  <TimePickerRoot>
    <DatePicker {...props} operators={TIME_OPERATORS} />
  </TimePickerRoot>
);

export default TimePicker;
