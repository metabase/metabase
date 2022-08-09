import { color } from "metabase/lib/colors";
import _ from "underscore";

export const getAccentColorGroups = (palette: Record<string, string>) => {
  const groups = [
    _.times(8, i => [`accent${i}`]),
    _.times(8, i => [`accent${i}`, `accent${i}-dark`]),
    _.times(8, i => [`accent${i}`, `accent${i}-light`, `accent${i}-dark`]),
  ];

  return groups.map(group => group.flat().map(name => color(name, palette)));
};
