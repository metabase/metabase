const DEFAULT_OPTIONS = {
  date_style: "MMMM D, YYYY",
  date_abbreviate: false,
  date_separator: "/",
  time_style: "h:mm A",
  time_enabled: false,
};

const DATE_FORMATS = {
  YYYY: new Intl.DateTimeFormat("en", { year: "numeric" }),
  M: new Intl.DateTimeFormat("en", { month: "numeric" }),
  MMM: new Intl.DateTimeFormat("en", { month: "short" }),
  MMMM: new Intl.DateTimeFormat("en", { month: "long" }),
  D: new Intl.DateTimeFormat("en", { day: "numeric" }),
  ddd: new Intl.DateTimeFormat("en", { weekday: "short" }),
  dddd: new Intl.DateTimeFormat("en", { weekday: "long" }),
  HH: new Intl.DateTimeFormat("en", { hour: "2-digit", hour12: false }),
  h: new Intl.DateTimeFormat("en", { hour: "numeric", hour12: true }),
  mm: new Intl.DateTimeFormat("en", { minute: "2-digit" }),
};

const TIME_FORMATS = {
  "HH:mm": new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h24",
  }),
  "h:mm A": new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h12",
  }),
};

const formatDate = (date, { date_style, date_abbreviate, date_separator }) => {
  return date_style
    .replace(/M+/g, date_abbreviate ? "MMM" : "MMMM")
    .replace(/d+/g, date_abbreviate ? "ddd" : "dddd")
    .replace(/\w+/g, field => DATE_FORMATS[field].format(date))
    .replace(/\//g, date_separator);
};

const formatTime = (date, { time_style, time_enabled }) => {
  return time_enabled ? TIME_FORMATS[time_style].format(date) : "";
};

export const formatDateTime = (date, options) => {
  const dateText = formatDate(date, { ...DEFAULT_OPTIONS, ...options });
  const timeText = formatTime(date, { ...DEFAULT_OPTIONS, ...options });

  return timeText ? `${dateText} ${timeText}` : dateText;
};
