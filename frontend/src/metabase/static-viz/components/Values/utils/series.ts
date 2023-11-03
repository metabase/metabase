import type {
  SeriesDatum,
  StackedDatum,
} from "metabase/static-viz/components/Values/types";

export const getX = (d: SeriesDatum | StackedDatum) => d[0];
export const getY = (d: SeriesDatum | StackedDatum) => d[1];
export const setY = <T extends SeriesDatum | StackedDatum>(
  d: T,
  value: number,
): T => {
  const newDatum = [...d];
  newDatum[1] = value;
  return newDatum as T;
};
