/* Location descriptor used by react-router and history */
export type LocationDescriptor = {
  hash: string;
  pathname: string;
  search?: string;
  query?: Record<string, string>;
};

/* Map of query string names to string values */
export type QueryParams = Record<string, string>;
