import dayjs, { type Dayjs } from "dayjs";

export const CALENDAR_IDS = ["gregory", "persian"] as const;
export type CalendarId = (typeof CALENDAR_IDS)[number];
export const DEFAULT_CALENDAR: CalendarId = "gregory";

let displayCalendar: CalendarId = DEFAULT_CALENDAR;

/** Dates remain Gregorian; this setting is read only at display boundaries. */
export function setDisplayCalendar(calendar: CalendarId) {
  displayCalendar = calendar;
}

export function getDisplayCalendar() {
  return displayCalendar;
}

export function formatDisplayDate(
  value: Dayjs,
  format: string,
  calendar: CalendarId = displayCalendar,
) {
  if (calendar === "gregory") {
    return value.format(format);
  }

  // Localized Day.js tokens (for example `LL`) are normally expanded by the
  // localizedFormat plugin. Expand them before replacing calendar fields.
  format = format.replace(/LTS|LT|LLLL|LLL|LL|L/g, (token) =>
    dayjs.localeData().longDateFormat(token),
  );

  const locale = dayjs.locale().split("-")[0] || "en";
  const localeWithCalendar = `${locale}-u-ca-persian-nu-latn`;
  const date = value.toDate();
  const parts = new Intl.DateTimeFormat(localeWithCalendar, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  const numericMonth = new Intl.DateTimeFormat(localeWithCalendar, {
    month: "numeric",
  }).format(date);
  const shortMonth = new Intl.DateTimeFormat(localeWithCalendar, {
    month: "short",
  }).format(date);
  const shortWeekday = new Intl.DateTimeFormat(localeWithCalendar, {
    weekday: "short",
  }).format(date);
  const replacements: Record<string, string> = {
    YYYY: part("year"),
    MMMM: part("month"),
    MMM: shortMonth,
    MM: numericMonth.padStart(2, "0"),
    M: numericMonth,
    DD: part("day").padStart(2, "0"),
    D: part("day"),
    dddd: part("weekday"),
    ddd: shortWeekday,
  };

  return format.replace(
    /\[[^\]]*\]|YYYY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|hh|h|mm|m|ss|s|A|a/g,
    (token) => {
      if (token.startsWith("[")) {
        return token.slice(1, -1);
      }
      return replacements[token] ?? value.format(token);
    },
  );
}
