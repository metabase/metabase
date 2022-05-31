import { times, unzip } from "lodash";
import { color } from "metabase/lib/colors";

export const getAccentColors = () => {
  return times(8, i => color(`accent${i}`));
};

export const getTintColors = () => {
  return times(8, i => color(`accent${i}-light`));
};

export const getShadeColors = () => {
  return times(8, i => color(`accent${i}-dark`));
};

export const getForegroundColors = () => {
  return [...getAccentColors(), ...getTintColors(), ...getShadeColors()];
};

export const getBackgroundColors = () => {
  return [...getAccentColors(), ...getTintColors()];
};

export const getHarmonyColors = () => {
  return unzip([getAccentColors(), getTintColors(), getShadeColors()]).flat();
};

export const getStatusColorRanges = () => {
  return [
    [color("error"), color("white"), color("success")],
    [color("error"), color("warning"), color("success")],
  ];
};
