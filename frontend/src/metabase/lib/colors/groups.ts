import { times } from "lodash";
import { color } from "metabase/lib/colors";

export const getForegroundColors = () => [
  ...times(8, i => color(`accent${i}`)),
  ...times(8, i => color(`accent${i}-light`)),
  ...times(8, i => color(`accent${i}-dark`)),
];

export const getBackgroundColors = () => [
  ...times(8, i => color(`accent${i}`)),
  ...times(8, i => color(`accent${i}-light`)),
];

export const getStatusColorRanges = () => [
  [color("error"), color("white"), color("success")],
  [color("error"), color("warning"), color("success")],
];
