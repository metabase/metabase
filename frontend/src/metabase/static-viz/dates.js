const DEFAULT_OPTIONS = {
  date_style: "M/D/YYYY",
  date_abbreviate: false,
  date_separator: "/",
  time_style: "h:mm A",
  time_enabled: false,
};

const DATE_FORMATS = {
  YYYY: new Intl.DateTimeFormat([], { year: "numeric" }),
  M: new Intl.DateTimeFormat([], { month: "numeric" }),
  MMM: new Intl.DateTimeFormat([], { month: "short" }),
  MMMM: new Intl.DateTimeFormat([], { month: "long" }),
  D: new Intl.DateTimeFormat([], { day: "numeric" }),
  ddd: new Intl.DateTimeFormat([], { weekday: "short" }),
  dddd: new Intl.DateTimeFormat([], { weekday: "long" }),
  HH: new Intl.DateTimeFormat([], { hour: "2-digit", hour12: false }),
  h: new Intl.DateTimeFormat([], { hour: "numeric", hour12: true }),
  mm: new Intl.DateTimeFormat([], { minute: "2-digit" }),
};

const TIME_FORMATS = {
  "HH:mm": new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h24",
  }),
  "h:mm A": new Intl.DateTimeFormat([], {
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h12",
  }),
};

const formatDate = (date, { date_style, date_abbreviate, date_separator }) => {
  return date_style
    .replace(/MMMM/g, date_abbreviate ? "MMM" : "MMMM")
    .replace(/dddd/g, date_abbreviate ? "ddd" : "dddd")
    .replace(/\//g, date_separator)
    .replace(/\w+/g, field => DATE_FORMATS[field].format(date));
};

const formatTime = (date, { time_style, time_enabled }) => {
  return time_enabled ? TIME_FORMATS[time_style].format(date) : "";
};

export const formatDateTime = (date, options) => {
  const dateText = formatDate(date, { ...DEFAULT_OPTIONS, ...options });
  const timeText = formatTime(date, { ...DEFAULT_OPTIONS, ...options });

  return timeText ? `${dateText} ${timeText}` : dateText;
};
