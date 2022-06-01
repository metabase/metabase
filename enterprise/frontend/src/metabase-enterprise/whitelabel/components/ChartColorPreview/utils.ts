import { color } from "metabase/lib/colors";
import { times } from "lodash";

export const getAccentColors = (palette: Record<string, string>) =>
  times(8, i => [`accent${i}`, `accent${i}-light`, `accent${i}-dark`])
    .flat()
    .map(name => color(name, palette));
