import { t } from "ttag";

export const DIMENSIONS = {
  maxSideLength: 550,
  padding: {
    legend: 16,
    side: 12,
  },
  slice: {
    innerRadiusRatio: 3 / 5,
    borderProportion: 360, // 1 degree
    maxFontSize: 20,
    minFontSize: 14,
    label: {
      fontWeight: 700,
      padding: 4,
    },
  },
  total: {
    minWidth: 120,
    valueFontSize: 22,
    labelFontSize: 14,
  },
};

export const SLICE_THRESHOLD = 0.025; // approx 1 degree in percentage

export const OTHER_SLICE_MIN_PERCENTAGE = 0.005;

export const OTHER_SLICE_KEY = t`Other`;

export const TOTAL_TEXT = t`Total`.toUpperCase();
