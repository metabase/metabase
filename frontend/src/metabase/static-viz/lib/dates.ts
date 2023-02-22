export type DateFormatOptions = {
  date_style?: string;
  date_abbreviate?: boolean;
  date_separator?: string;
  time_style?: string;
  time_enabled?: boolean;
};

const DEFAULT_OPTIONS = {
  date_style: "M/D/YYYY",
  date_abbreviate: false,
  date_separator: "/",
  time_style: "h:mm A",
  time_enabled: false,
};

const DATE_FORMATS: Record<string, Intl.DateTimeFormat> = {
  YY: new Intl.DateTimeFormat("en", { year: "2-digit" }),
  YYYY: new Intl.DateTimeFormat("en", { year: "numeric" }),
  M: new Intl.DateTimeFormat("en", { month: "numeric" }),
  MM: new Intl.DateTimeFormat("en", { month: "2-digit" }),
  MMM: new Intl.DateTimeFormat("en", { month: "short" }),
  MMMM: new Intl.DateTimeFormat("en", { month: "long" }),
  D: new Intl.DateTimeFormat("en", { day: "numeric" }),
  DD: new Intl.DateTimeFormat("en", { day: "2-digit" }),
  ddd: new Intl.DateTimeFormat("en", { weekday: "short" }),
  dddd: new Intl.DateTimeFormat("en", { weekday: "long" }),
  H: new Intl.DateTimeFormat("en", { hour: "numeric", hour12: false }),
  HH: new Intl.DateTimeFormat("en", { hour: "2-digit", hour12: false }),
  h: new Intl.DateTimeFormat("en", { hour: "numeric", hour12: true }),
  hh: new Intl.DateTimeFormat("en", { hour: "2-digit", hour12: true }),
  m: new Intl.DateTimeFormat("en", { minute: "numeric" }),
  mm: new Intl.DateTimeFormat("en", { minute: "2-digit" }),
};

const findDatePart = (parts: Intl.DateTimeFormatPart[], type: string) => {
  return parts.find(part => part.type === type)?.value;
};

const findQuarter = (month: number) => {
  return Math.floor((month - 1) / 3) + 1;
};

const formatDatePart = (date: Date, field: string) => {
  switch (field) {
    case "h":
      return findDatePart(DATE_FORMATS.h.formatToParts(date), "hour");
    case "hh":
      return findDatePart(DATE_FORMATS.hh.formatToParts(date), "hour");
    case "A":
      return findDatePart(DATE_FORMATS.h.formatToParts(date), "dayPeriod");
    case "Q":
      return `Q${findQuarter(parseInt(DATE_FORMATS.M.format(date)))}`;
    default:
      return DATE_FORMATS[field]?.format(date);
  }
};

export const formatDate = (date: Date, options: DateFormatOptions) => {
  const {
    date_style,
    date_abbreviate,
    date_separator,
    time_style,
    time_enabled,
  } = { ...DEFAULT_OPTIONS, ...options };

  const formattedDate = date_style
    .replace(/MMMM/g, date_abbreviate ? "MMM" : "MMMM")
    .replace(/dddd/g, date_abbreviate ? "ddd" : "dddd")
    .replace(/\//g, date_separator)
    .replace(/\w+/g, field => formatDatePart(date, field) || "");

  const formattedTime = time_style
    .replace(/\//g, date_separator)
    .replace(/\w+/g, field => formatDatePart(date, field) || "");

  return time_enabled ? `${formattedDate} ${formattedTime}` : formattedDate;
};
