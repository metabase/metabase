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

export const getPreferredColor = (key: string) => {
  switch (key.toLowerCase()) {
    case "success":
    case "succeeded":
    case "pass":
    case "passed":
    case "valid":
    case "complete":
    case "completed":
    case "accepted":
    case "active":
    case "profit":
      return color("success");
    case "error":
    case "fail":
    case "failed":
    case "failure":
    case "failures":
    case "invalid":
    case "rejected":
    case "inactive":
    case "loss":
    case "cost":
    case "deleted":
    case "pending":
      return color("error");
    case "warn":
    case "warning":
    case "incomplete":
    case "unstable":
      return color("warning");
    case "count":
      return color("brand");
    case "sum":
      return color("accent1");
    case "average":
      return color("accent2");
  }
};
