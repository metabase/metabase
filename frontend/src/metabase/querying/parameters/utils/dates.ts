import dayjs from "dayjs";

import type { DatePickerValue } from "metabase/querying/filters/types";
import { isDatePickerTruncationUnit } from "metabase/querying/filters/utils";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function serializeDate(date: Date, hasTime: boolean) {
  return hasTime
    ? dayjs(date).format("YYYY-MMM-DD'T'HH:mm:SS")
    : dayjs(date).format("YYYY-MMM-DD");
}

function hasTimePart(s: string) {
  return s.includes("T");
}

type Serializer = {
  regex: RegExp;
  serialize: (value: DatePickerValue) => string | undefined;
  deserialize: (match: RegExpMatchArray) => DatePickerValue | undefined;
};

const SERIALIZERS: Serializer[] = [
  // single day
  {
    regex: /^([\d-T:]+)$/,
    serialize: value => {
      if (value.type === "specific" && value.operator === "=") {
        const [date] = value.values;
        return serializeDate(date, value.hasTime);
      }
    },
    deserialize: match => {
      const date = dayjs(match[1]);
      if (date.isValid()) {
        return {
          type: "specific",
          operator: "=",
          values: [date.toDate()],
          hasTime: hasTimePart(match[0]),
        };
      }
    },
  },
  // before day
  {
    regex: /^~([\d-T:]+)$/,
    serialize: value => {
      if (value.type === "specific" && value.operator === "<") {
        const [date] = value.values;
        return `~${serializeDate(date, value.hasTime)}`;
      }
    },
    deserialize: match => {
      const date = dayjs(match[1]);
      if (date.isValid()) {
        return {
          type: "specific",
          operator: "<",
          values: [date.toDate()],
          hasTime: hasTimePart(match[0]),
        };
      }
    },
  },
  // after day
  {
    regex: /^([\d-T:]+)~$/,
    serialize: value => {
      if (value.type === "specific" && value.operator === ">") {
        const [date] = value.values;
        return `${serializeDate(date, value.hasTime)}~`;
      }
    },
    deserialize: match => {
      const date = dayjs(match[1]);
      if (date.isValid()) {
        return {
          type: "specific",
          operator: ">",
          values: [date.toDate()],
          hasTime: hasTimePart(match[0]),
        };
      }
    },
  },
  // day range
  {
    regex: /^([\d-T:]+)~([\d-T:]+)$/,
    serialize: value => {
      if (value.type === "specific" && value.operator === "between") {
        const [date1, date2] = value.values;
        return `${serializeDate(date1, value.hasTime)}~${serializeDate(date2, value.hasTime)}`;
      }
    },
    deserialize: match => {
      const date1 = dayjs(match[1]);
      const date2 = dayjs(match[2]);
      if (date1.isValid() && date2.isValid()) {
        return {
          type: "specific",
          operator: "between",
          values: [date1.toDate(), date2.toDate()],
          hasTime: hasTimePart(match[0]),
        };
      }
    },
  },
  {
    regex: /^today$/,
    serialize: value => {
      if (
        value.type === "relative" &&
        value.value === "current" &&
        value.unit === "day"
      ) {
        return "today";
      }
    },
    deserialize: () => {
      return {
        type: "relative",
        value: "current",
        unit: "day",
      };
    },
  },
  {
    regex: /^yesterday$/,
    serialize: value => {
      if (
        value.type === "relative" &&
        value.value === -1 &&
        value.unit === "day"
      ) {
        return "yesterday";
      }
    },
    deserialize: () => {
      return {
        type: "relative",
        value: -1,
        unit: "day",
      };
    },
  },
  {
    regex: /^this(\w+)$/,
    serialize: value => {
      if (value.type === "relative" && value.value === "current") {
        return `this${value.unit}`;
      }
    },
    deserialize: match => {
      const unit = match[1];
      if (isDatePickerTruncationUnit(unit)) {
        return {
          type: "relative",
          value: "current",
          unit,
        };
      }
    },
  },
  {
    regex: /^last(\w+)$/,
    serialize: value => {
      if (
        value.type === "relative" &&
        value.value === -1 &&
        value.offsetValue == null &&
        value.offsetUnit == null
      ) {
        return `last${value.unit}`;
      }
    },
    deserialize: match => {
      const unit = match[1];
      if (isDatePickerTruncationUnit(unit)) {
        return {
          type: "relative",
          value: -1,
          unit,
        };
      }
    },
  },
  {
    regex: /^exclude-hours-([-\d]+)$/,
    serialize: value => {
      if (value.type === "exclude" && value.unit === "hour-of-day") {
        return `exclude-hours-${value.values.join("-")}`;
      }
    },
    deserialize: match => {
      const hours = match[1].split("-").map(value => parseInt(value));
      if (hours.every(value => value >= 0 && value <= 23)) {
        return {
          type: "exclude",
          operator: "!=",
          unit: "hour-of-day",
          values: hours,
        };
      }
    },
  },
  {
    regex: /^exclude-days-([-\w]+)$/,
    serialize: value => {
      if (value.type === "exclude" && value.unit === "day-of-week") {
        const dayNames = value.values.map(dayNumber => DAYS[dayNumber - 1]);
        return `exclude-days-${dayNames.join("-")}`;
      }
    },
    deserialize: match => {
      const dayNumbers = match[1]
        .split("-")
        .map(value => DAYS.indexOf(value) + 1);
      if (dayNumbers.every(dayNumber => dayNumber > 0)) {
        return {
          type: "exclude",
          operator: "!=",
          unit: "day-of-week",
          values: dayNumbers,
        };
      }
    },
  },
  {
    regex: /^exclude-months-([-\w]+)$/,
    serialize: value => {
      if (value.type === "exclude" && value.unit === "month-of-year") {
        const monthNames = value.values.map(dayNumber => MONTHS[dayNumber - 1]);
        return `exclude-months-${monthNames.join("-")}`;
      }
    },
    deserialize: match => {
      const monthNumbers = match[1]
        .split("-")
        .map(value => MONTHS.indexOf(value) + 1);
      if (monthNumbers.every(monthNumber => monthNumber > 0)) {
        return {
          type: "exclude",
          operator: "!=",
          unit: "month-of-year",
          values: monthNumbers,
        };
      }
    },
  },
  {
    regex: /^exclude-quarters-([-\d]+)$/,
    serialize: value => {
      if (value.type === "exclude" && value.unit === "hour-of-day") {
        return `exclude-quarters-${value.values.join("-")}`;
      }
    },
    deserialize: match => {
      const quarters = match[1].split("-").map(value => parseInt(value));
      if (quarters.every(value => value >= 1 && value <= 4)) {
        return {
          type: "exclude",
          operator: "!=",
          unit: "quarter-of-year",
          values: quarters,
        };
      }
    },
  },
];

export function serializeDateFilter(value: DatePickerValue): string {
  for (const serializer of SERIALIZERS) {
    const s = serializer.serialize(value);
    if (s != null) {
      return s;
    }
  }

  throw new TypeError();
}

export function deserializeDateFilter(s: string): DatePickerValue | undefined {
  for (const serializer of SERIALIZERS) {
    const match = s.match(serializer.regex);
    if (match != null) {
      const value = serializer.deserialize(match);
      if (value != null) {
        return value;
      }
    }
  }
}
