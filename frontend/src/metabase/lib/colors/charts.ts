import { times } from "lodash";
import { color } from "metabase/lib/colors";

export const getNormalColors = () => [
  color("brand"),
  ...times(7, i => color(`accent${i + 1}`)),
  color("text-dark"),
];

export const getDesaturatedColors = () => [
  color("brand"),
  ...times(4, i => color(`accent${i + 1}`)),
];

export const getStatusColorRanges = () => [
  [color("error"), color("white"), color("success")],
  [color("success"), color("white"), color("error")],
  [color("error"), color("warning"), color("success")],
  [color("success"), color("warning"), color("error")],
];
