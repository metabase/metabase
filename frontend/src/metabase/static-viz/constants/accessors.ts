export const POSITIONAL_ACCESSORS = {
  x: (row: any[]) => row[0],
  y: (row: any[]) => row[1],
};

export const DATE_ACCESSORS = {
  x: (row: any[]) => new Date(row[0]).valueOf(),
  y: (row: any[]) => row[1],
};

export const DIMENSION_ACCESSORS = {
  dimension: (row: any[]) => row[0],
  metric: (row: any[]) => row[1],
};
