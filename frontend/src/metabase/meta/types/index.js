/* @flow */

// ISO8601 timestamp
export type ISO8601Time = string;

// dashboard, card, etc
export type EntityType = string;

// DashboardId, CardId, etc
export type EntityId = number;

// An Icon name, which is defined in `metabase/icon_paths.js`
export type IconName = string;

/* Location descriptor used by react-router and history */
export type LocationDescriptor = {
  hash: string,
  pathname: string,
  search?: string,
  query?: { [key: string]: string },
};

/* Map of query string names to string values */
export type QueryParams = {
  [key: string]: string,
};

/* Metabase API error object returned by the backend */
export type ApiError = {
  status: number, // HTTP status
  // TODO: incomplete
};

// FIXME: actual moment.js type
export type Moment = {
  locale: () => Moment,
  format: (format: string) => string,
};
