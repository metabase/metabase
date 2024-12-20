import dayjs from "dayjs";

import type { DatePickerValue } from "metabase/querying/filters/types";

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

function hasTimePart(s: string) {
  return s.includes("T");
}

type Serializer = {
  regex: RegExp;
  serialize: (value: DatePickerValue) => string | undefined;
  deserialize: (match: RegExpMatchArray) => DatePickerValue | undefined;
};

const SERIALIZERS: Serializer[] = [
  {
    regex: /^([\d-T:]+)$/,
    serialize: () => undefined,
    deserialize: match => {
      const date = dayjs(match[1]);
      if (date.isValid()) {
        return {
          type: "specific",
          operator: "=",
          values: [date.toDate()],
          hasTime: hasTimePart(match[1]),
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
