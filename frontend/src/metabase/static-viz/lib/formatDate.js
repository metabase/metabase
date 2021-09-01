export const formatDate = (
  value,
  {
    date_style = "M/D/YYYY",
    date_abbreviate = false,
    date_separator = "/",
    time_style = "h:mm A",
    time_enabled = false,
  } = {},
) => {
  const date = new Date(value);

  const formattedDate = date_style
    .replace(/MMMM/g, date_abbreviate ? "MMM" : "MMMM")
    .replace(/dddd/g, date_abbreviate ? "ddd" : "dddd")
    .replace(/\//g, date_separator)
    .replace(/\w+/g, field => formatDateField(date, field));

  const formattedTime = time_style
    .replace(/\//g, date_separator)
    .replace(/\w+/g, field => formatDateField(date, field));

  return time_enabled ? `${formattedDate} ${formattedTime}` : formattedDate;
};

const DATE_FORMATS = {
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

const formatDateField = (date, field) => {
  switch (field) {
    case "Q":
      return `Q${(date.getMonth() % 4) + 1}`;
    case "A":
      return DATE_FORMATS.h
        .formatToParts(date)
        .filter(part => part.type === "dayPeriod")
        .map(part => part.value)[0];
    default:
      return DATE_FORMATS[field].format(date);
  }
};
