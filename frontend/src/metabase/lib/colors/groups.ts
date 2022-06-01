import { times, unzip } from "lodash";
import { ACCENT_COUNT, color } from "./palette";
import { ColorGroupOptions } from "./types";

export const getAccentColors = () => {
  return times(ACCENT_COUNT, i => color(`accent${i}`));
};

export const getTintColors = () => {
  return times(ACCENT_COUNT, i => color(`accent${i}-light`));
};

export const getShadeColors = () => {
  return times(ACCENT_COUNT, i => color(`accent${i}-dark`));
};

export const getDistinctColors = (options?: ColorGroupOptions) => {
  return getAccentColorRanges(options).flat();
};

export const getHarmonyColors = (options?: ColorGroupOptions) => {
  return unzip(getAccentColorRanges(options)).flat();
};

export const getAccentColorRanges = ({
  light = true,
  dark = true,
}: ColorGroupOptions = {}) => {
  const ranges = [getAccentColors()];
  light && ranges.push(getTintColors());
  dark && ranges.push(getShadeColors());

  return ranges;
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
