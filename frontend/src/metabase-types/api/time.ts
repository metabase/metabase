// ISO8601 timestamp
export type ISO8601Time = string;

// FIXME: actual moment.js type
export type Moment = {
  locale: () => Moment;
  format: (format: string) => string;
};
