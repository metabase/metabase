/* eslint-disable @typescript-eslint/no-unsafe-return -- FIXME: any-typed values */
export const DIMENSION_ACCESSORS = {
  dimension: (row: any[]) => row[0],
  metric: (row: any[]) => row[1],
};
