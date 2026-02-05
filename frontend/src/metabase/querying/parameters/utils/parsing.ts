import dayjs from "dayjs";

import { parseNumber } from "metabase/lib/number";
import { isNotNull } from "metabase/lib/types";
import type { DateFilterValue } from "metabase/querying/common/types";
import { isDatePickerTruncationUnit } from "metabase/querying/filters/utils/dates";
import * as Lib from "metabase-lib";
import type {
  ParameterType,
  ParameterValueOrArray,
  TemporalUnit,
} from "metabase-types/api";

import type { NumberFilterValue } from "../types";

function normalizeArray(value: ParameterValueOrArray | null | undefined) {
  if (value == null) {
    return [];
  } else {
    return Array.isArray(value) ? value : [value];
  }
}

export function deserializeStringParameterValue(
  value: ParameterValueOrArray | null | undefined,
): string[] {
  return normalizeArray(value).reduce((values: string[], item) => {
    if (item != null && item !== "") {
      values.push(String(item));
    }
    return values;
  }, []);
}

export function normalizeStringParameterValue(
  value: ParameterValueOrArray | null | undefined,
): string[] {
  return deserializeStringParameterValue(value);
}

export function serializeNumberParameterValue(
  value: NumberFilterValue[],
): ParameterValueOrArray {
  return value.map((item) => {
    return typeof item === "bigint" ? String(item) : item;
  });
}

export function deserializeNumberParameterValue(
  type: ParameterType,
  value: ParameterValueOrArray | null | undefined,
): NumberFilterValue[] {
  const values = normalizeArray(value).map((item) => {
    if (typeof item === "number" && Number.isFinite(item)) {
      return item;
    }
    if (typeof item === "string") {
      return parseNumber(item);
    }
    return null;
  }, []);

  // allow "between" values without min or max, e.g. `[1, null]` or `[null, 2]`
  return type === "number/between" &&
    values.length === 2 &&
    values.some(isNotNull)
    ? values
    : values.filter(isNotNull);
}

export function normalizeNumberParameterValue(
  type: ParameterType,
  value: ParameterValueOrArray | null | undefined,
): ParameterValueOrArray {
  return serializeNumberParameterValue(
    deserializeNumberParameterValue(type, value),
  );
}

export function deserializeBooleanParameterValue(
  value: ParameterValueOrArray | null | undefined,
): boolean[] {
  return normalizeArray(value).reduce((values: boolean[], item) => {
    if (typeof item === "boolean") {
      values.push(item);
    }
    if (item === "true") {
      values.push(true);
    }
    if (item === "false") {
      values.push(false);
    }
    return values;
  }, []);
}

export function normalizeBooleanParameterValue(
  value: ParameterValueOrArray | null | undefined,
): boolean[] {
  return deserializeBooleanParameterValue(value);
}

function serializeDate(date: Date, hasTime: boolean) {
  return hasTime
    ? dayjs(date).format("YYYY-MM-DDTHH:mm:ss")
    : dayjs(date).format("YYYY-MM-DD");
}

function hasTimePart(s: string) {
  return s.includes("T");
}

type DateFilterSerializer = {
  regex: RegExp;
  serialize: (value: DateFilterValue) => string | undefined;
  deserialize: (match: RegExpMatchArray) => DateFilterValue | undefined;
};

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

const DATE_FILTER_SERIALIZERS: DateFilterSerializer[] = [
  // entire month, `2020-04`
  {
    regex: /^([0-9]{4})-([0-9]{2})$/,
    serialize: (value) => {
      if (value.type === "month") {
        const { year, month } = value;
        return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}`;
      }
    },
    deserialize: (match) => {
      const year = parseInt(match[1]);
      const month = parseInt(match[2]);
      if (isFinite(year) && month >= 1 && month <= 12) {
        return {
          type: "month",
          year,
          month,
        };
      }
    },
  },
  // entire quarter, `Q2`
  {
    regex: /^Q([1-4])-([0-9]{4})$/,
    serialize: (value) => {
      if (value.type === "quarter") {
        const { year, quarter } = value;
        return `Q${quarter}-${year.toString().padStart(4, "0")}`;
      }
    },
    deserialize: (match) => {
      const year = parseInt(match[2]);
      const quarter = parseInt(match[1]);
      if (isFinite(year) && quarter >= 1 && quarter <= 4) {
        return {
          type: "quarter",
          year,
          quarter,
        };
      }
    },
  },
  // single day, `2020-01-02` or `2020-01-02T:10:20:00`
  {
    regex: /^([\d-T:]+)$/,
    serialize: (value) => {
      if (value.type === "specific" && value.operator === "=") {
        const [date] = value.values;
        return serializeDate(date, value.hasTime);
      }
    },
    deserialize: (match) => {
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
  // before day, `~2020-01-02` or `~2020-01-02T:10:20:00`
  {
    regex: /^~([\d-T:]+)$/,
    serialize: (value) => {
      if (value.type === "specific" && value.operator === "<") {
        const [date] = value.values;
        return `~${serializeDate(date, value.hasTime)}`;
      }
    },
    deserialize: (match) => {
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
  // after day, `2020-01-02~` or `2020-01-02T:10:20:00~`
  {
    regex: /^([\d-T:]+)~$/,
    serialize: (value) => {
      if (value.type === "specific" && value.operator === ">") {
        const [date] = value.values;
        return `${serializeDate(date, value.hasTime)}~`;
      }
    },
    deserialize: (match) => {
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
  // day range, `2020-01-02~2020-05-10` or `2020-01-02T05:08:00~2020-05-10T10:21:00`
  {
    regex: /^([\d-T:]+)~([\d-T:]+)$/,
    serialize: (value) => {
      if (value.type === "specific" && value.operator === "between") {
        const [date1, date2] = value.values;
        return `${serializeDate(date1, value.hasTime)}~${serializeDate(date2, value.hasTime)}`;
      }
    },
    deserialize: (match) => {
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
  // `today`
  {
    regex: /^today$/,
    // TODO serialize properly when legacy `getFilterTitle` is removed
    serialize: () => undefined,
    deserialize: () => {
      return {
        type: "relative",
        value: 0,
        unit: "day",
      };
    },
  },
  // `yesterday`
  {
    regex: /^yesterday$/,
    // TODO serialize properly when legacy `getFilterTitle` is removed
    serialize: () => undefined,
    deserialize: () => {
      return {
        type: "relative",
        value: -1,
        unit: "day",
      };
    },
  },
  // `thismonth`, `thisyear`
  {
    regex: /^this(\w+)$/,
    serialize: (value) => {
      if (value.type === "relative" && value.value === 0) {
        return `this${value.unit}`;
      }
    },
    deserialize: (match) => {
      const unit = match[1];
      if (isDatePickerTruncationUnit(unit)) {
        return {
          type: "relative",
          value: 0,
          unit,
        };
      }
    },
  },
  // `previousmonth`, `previousyear`
  {
    regex: /^previous(\w+)$/,
    // TODO serialize properly when legacy `getFilterTitle` is removed
    serialize: () => undefined,
    deserialize: (match) => {
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
  // `past30days`, `past30days~`. `~` means `includeCurrent`
  {
    regex: /^past(\d+)(\w+)s(~)?$/,
    serialize: (value) => {
      if (
        value.type === "relative" &&
        value.value !== 0 &&
        value.value < 0 &&
        value.offsetValue == null &&
        value.offsetUnit == null
      ) {
        const suffix = value.options?.includeCurrent ? "~" : "";
        return `past${-value.value}${value.unit}s${suffix}`;
      }
    },
    deserialize: (match) => {
      const value = parseInt(match[1]);
      const unit = match[2];
      const suffix = match[3];
      if (isFinite(value) && isDatePickerTruncationUnit(unit)) {
        return {
          type: "relative",
          value: -value,
          unit,
          options: suffix ? { includeCurrent: true } : undefined,
        };
      }
    },
  },
  // `next30days`, `next30days~`. `~` means `includeCurrent`
  {
    regex: /^next(\d+)(\w+)s(~)?$/,
    serialize: (value) => {
      if (
        value.type === "relative" &&
        value.value !== 0 &&
        value.value > 0 &&
        value.offsetValue == null &&
        value.offsetUnit == null
      ) {
        const suffix = value.options?.includeCurrent ? "~" : "";
        return `next${value.value}${value.unit}s${suffix}`;
      }
    },
    deserialize: (match) => {
      const value = parseInt(match[1]);
      const unit = match[2];
      const suffix = match[3];
      if (isFinite(value) && isDatePickerTruncationUnit(unit)) {
        return {
          type: "relative",
          value,
          unit,
          options: suffix ? { includeCurrent: true } : undefined,
        };
      }
    },
  },
  // `past30days-from-2years`
  {
    regex: /^past(\d+)(\w+)s-from-(\d+)(\w+)s$/,
    serialize: (value) => {
      if (
        value.type === "relative" &&
        value.value !== 0 &&
        value.value < 0 &&
        value.offsetValue != null &&
        value.offsetValue < 0 &&
        value.offsetUnit != null
      ) {
        return `past${-value.value}${value.unit}s-from-${-value.offsetValue}${value.offsetUnit}s`;
      }
    },
    deserialize: (match) => {
      const value = parseInt(match[1]);
      const unit = match[2];
      const offsetValue = parseInt(match[3]);
      const offsetUnit = match[4];
      if (
        isFinite(value) &&
        isDatePickerTruncationUnit(unit) &&
        isFinite(offsetValue) &&
        isDatePickerTruncationUnit(offsetUnit)
      ) {
        return {
          type: "relative",
          value: -value,
          unit,
          offsetValue: -offsetValue,
          offsetUnit,
        };
      }
    },
  },
  // `next30days-from-2years`
  {
    regex: /^next(\d+)(\w+)s-from-(\d+)(\w+)s$/,
    serialize: (value) => {
      if (
        value.type === "relative" &&
        value.value !== 0 &&
        value.value > 0 &&
        value.offsetValue != null &&
        value.offsetValue > 0 &&
        value.offsetUnit != null
      ) {
        return `next${value.value}${value.unit}s-from-${value.offsetValue}${value.offsetUnit}s`;
      }
    },
    deserialize: (match) => {
      const value = parseInt(match[1]);
      const unit = match[2];
      const offsetValue = parseInt(match[3]);
      const offsetUnit = match[4];
      if (
        isFinite(value) &&
        isDatePickerTruncationUnit(unit) &&
        isFinite(offsetValue) &&
        isDatePickerTruncationUnit(offsetUnit)
      ) {
        return {
          type: "relative",
          value,
          unit,
          offsetValue,
          offsetUnit,
        };
      }
    },
  },
  // `exclude-hours-1-23`
  {
    regex: /^exclude-hours-([-\d]+)$/,
    serialize: (value) => {
      if (value.type === "exclude" && value.unit === "hour-of-day") {
        return `exclude-hours-${value.values.join("-")}`;
      }
    },
    deserialize: (match) => {
      const hours = match[1].split("-").map((value) => parseInt(value));
      if (hours.every((value) => value >= 0 && value <= 23)) {
        return {
          type: "exclude",
          operator: "!=",
          unit: "hour-of-day",
          values: hours,
        };
      }
    },
  },
  // `exclude-days-Mon-San`
  {
    regex: /^exclude-days-([-\w]+)$/,
    serialize: (value) => {
      if (value.type === "exclude" && value.unit === "day-of-week") {
        const dayNames = value.values.map((dayNumber) => DAYS[dayNumber - 1]);
        return `exclude-days-${dayNames.join("-")}`;
      }
    },
    deserialize: (match) => {
      const dayNumbers = match[1]
        .split("-")
        .map((value) => DAYS.indexOf(value) + 1);
      if (dayNumbers.every((dayNumber) => dayNumber > 0)) {
        return {
          type: "exclude",
          operator: "!=",
          unit: "day-of-week",
          values: dayNumbers,
        };
      }
    },
  },
  // `exclude-months-Jan-Dec`
  {
    regex: /^exclude-months-([-\w]+)$/,
    serialize: (value) => {
      if (value.type === "exclude" && value.unit === "month-of-year") {
        const monthNames = value.values.map(
          (dayNumber) => MONTHS[dayNumber - 1],
        );
        return `exclude-months-${monthNames.join("-")}`;
      }
    },
    deserialize: (match) => {
      const monthNumbers = match[1]
        .split("-")
        .map((value) => MONTHS.indexOf(value) + 1);
      if (monthNumbers.every((monthNumber) => monthNumber > 0)) {
        return {
          type: "exclude",
          operator: "!=",
          unit: "month-of-year",
          values: monthNumbers,
        };
      }
    },
  },
  // `exclude-quarters-1-4`
  {
    regex: /^exclude-quarters-([-\d]+)$/,
    serialize: (value) => {
      if (value.type === "exclude" && value.unit === "quarter-of-year") {
        return `exclude-quarters-${value.values.join("-")}`;
      }
    },
    deserialize: (match) => {
      const quarters = match[1].split("-").map((value) => parseInt(value));
      if (quarters.every((value) => value >= 1 && value <= 4)) {
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

export function serializeDateParameterValue(value: DateFilterValue): string {
  for (const serializer of DATE_FILTER_SERIALIZERS) {
    const text = serializer.serialize(value);
    if (text != null) {
      return text;
    }
  }

  throw new TypeError("Date filter cannot be serialized");
}

export function deserializeDateParameterValue(
  value: ParameterValueOrArray | null | undefined,
): DateFilterValue | null {
  if (typeof value !== "string") {
    return null;
  }

  for (const serializer of DATE_FILTER_SERIALIZERS) {
    const match = value.match(serializer.regex);
    if (match != null) {
      const value = serializer.deserialize(match);
      if (value != null) {
        return value;
      }
    }
  }

  return null;
}

export function normalizeDateParameterValue(
  value: ParameterValueOrArray | null | undefined,
): string | null {
  const dateValue = deserializeDateParameterValue(value);
  return dateValue != null ? serializeDateParameterValue(dateValue) : null;
}

export function deserializeTemporalUnitParameterValue(
  value: ParameterValueOrArray | null | undefined,
): TemporalUnit | null {
  const availableUnits = Lib.availableTemporalUnits();
  const matchedUnit = availableUnits.find((unit) => unit === value);
  return matchedUnit != null ? matchedUnit : null;
}

export function normalizeTemporalUnitParameterValue(
  value: ParameterValueOrArray | null | undefined,
): TemporalUnit | null {
  return deserializeTemporalUnitParameterValue(value);
}
