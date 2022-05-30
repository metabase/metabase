import { range } from "lodash";
import { color } from "metabase/lib/colors";

export const getNormalColors = () => [
  color("brand"),
  ...range(1, 8).map(i => color(`accent${i}`)),
  color("text-dark"),
];

export const getDesaturatedColors = () => [
  color("brand"),
  ...range(1, 5).map(i => color(`accent${i}`)),
];

export const getStatusColorRanges = () => [
  [color("error"), color("white"), color("success")],
  [color("error"), color("warning"), color("success")],
];
