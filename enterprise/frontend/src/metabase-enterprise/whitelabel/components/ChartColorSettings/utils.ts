import { times } from "lodash";

export const getChartColorGroups = (): string[][] =>
  times(8, i => [`accent${i}`, `accent${i}-light`, `accent${i}-dark`]);
