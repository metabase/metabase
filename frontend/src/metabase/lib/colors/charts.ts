import { times } from "lodash";
import { color } from "metabase/lib/colors";

export const getChartColors = () => [
  color("brand"),
  ...times(7, i => color(`accent${i + 1}`)),
  color("text-dark"),
];
