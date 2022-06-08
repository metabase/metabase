import { color } from "metabase/lib/colors";
import { times } from "lodash";

export const getAccentColorGroups = (palette: Record<string, string>) => {
  const groups = [
    times(8, i => [`accent${i}`]),
    times(8, i => [`accent${i}`, `accent${i}-dark`]),
    times(8, i => [`accent${i}`, `accent${i}-light`, `accent${i}-dark`]),
  ];

  return groups.map(group => group.flat().map(name => color(name, palette)));
};
