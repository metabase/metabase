import _ from "underscore";

import { color } from "metabase/ui/colors";
import { ACCENT_COUNT } from "metabase/ui/colors/palette";
import type { ColorPalette } from "metabase/ui/colors/types";

export const getAccentColorGroups = (palette: ColorPalette) => {
  const groups = [
    _.times(ACCENT_COUNT, (i) => [`accent${i}`]),
    _.times(ACCENT_COUNT, (i) => [`accent${i}`, `accent${i}-dark`]),
    _.times(ACCENT_COUNT, (i) => [
      `accent${i}`,
      `accent${i}-light`,
      `accent${i}-dark`,
    ]),
  ];

  return groups.map((group) =>
    group.flat().map((name) => color(name, palette)),
  );
};
