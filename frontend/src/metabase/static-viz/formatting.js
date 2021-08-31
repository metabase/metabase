const DEFAULT_NUMBER_OPTIONS = {
  number_style: "decimal",
  currency: null,
  currency_style: "symbol",
  number_separators: ".,",
  decimals: null,
  scale: 1,
  prefix: "",
  suffix: "",
};

const DEFAULT_DATE_OPTIONS = {
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

export const formatNumber = (number, options) => {
  const {
    number_style,
    currency,
    currency_style,
    number_separators: [decimal_separator, grouping_separator],
    scale,
    decimals,
    prefix,
    suffix,
  } = {
    ...DEFAULT_NUMBER_OPTIONS,
    ...options,
  };

  const format = new Intl.NumberFormat("en", {
    style: number_style !== "scientific" ? number_style : "decimal",
    notation: number_style !== "scientific" ? "standard" : "scientific",
    currency: currency,
    currencyDisplay: currency_style,
    useGrouping: true,
    minimumFractionalDigits: decimals != null ? decimals : 0,
    maximumFractionalDigits: decimals != null ? decimals : 2,
  });

  const formattedNumber = format
    .format(number * scale)
    .replace(/\./g, decimal_separator)
    .replace(/,/g, grouping_separator);

  return `${prefix}${formattedNumber}${suffix}`;
};

export const formatDate = (date, options) => {
  const {
    date_style,
    date_abbreviate,
    date_separator,
    time_style,
    time_enabled,
  } = { ...DEFAULT_DATE_OPTIONS, ...options };

  const formattedDate = date_style
    .replace(/MMMM/g, date_abbreviate ? "MMM" : "MMMM")
    .replace(/dddd/g, date_abbreviate ? "ddd" : "dddd")
    .replace(/\//g, date_separator)
    .replace(/\w+/g, field => DATE_FORMATS[field].format(date));

  const formattedTime = TIME_FORMATS[time_style].format(date);
  return time_enabled ? `${formattedDate} ${formattedTime}` : formattedDate;
};
