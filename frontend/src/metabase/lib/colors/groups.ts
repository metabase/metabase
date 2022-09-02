import _ from "underscore";
import { ACCENT_COUNT, color } from "./palette";
import { AccentColorOptions } from "./types";

export const getAccentColors = ({
  main = true,
  light = true,
  dark = true,
  harmony = false,
}: AccentColorOptions = {}) => {
  const ranges = [];
  main && ranges.push(getMainAccentColors());
  light && ranges.push(getLightAccentColors());
  dark && ranges.push(getDarkAccentColors());

  return harmony ? _.unzip(ranges).flat() : ranges.flat();
};

export const getMainAccentColors = () => {
  return _.times(ACCENT_COUNT, i => color(`accent${i}`));
};

export const getLightAccentColors = () => {
  return _.times(ACCENT_COUNT, i => color(`accent${i}-light`));
};

export const getDarkAccentColors = () => {
  return _.times(ACCENT_COUNT, i => color(`accent${i}-dark`));
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
    case "cancel":
    case "canceled":
    case "cancelled":
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
