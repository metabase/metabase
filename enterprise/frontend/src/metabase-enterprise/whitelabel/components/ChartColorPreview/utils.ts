import { color } from "metabase/ui/colors";
import { ACCENT_COUNT } from "metabase/ui/colors/palette";
import type { ColorPalette } from "metabase/ui/colors/types";
import { times } from "metabase/utils/arrays";

export const getAccentColorGroups = (palette: ColorPalette) => {
  const groups = [
    times(ACCENT_COUNT, (i) => [`accent${i}`]),
    times(ACCENT_COUNT, (i) => [`accent${i}`, `accent${i}-dark`]),
    times(ACCENT_COUNT, (i) => [
      `accent${i}`,
      `accent${i}-light`,
      `accent${i}-dark`,
    ]),
  ];

  return groups.map((group) =>
    group.flat().map((name) => color(name, palette)),
  );
};
