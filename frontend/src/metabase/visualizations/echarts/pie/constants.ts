import { t } from "ttag";

import { NULL_CHAR } from "../cartesian/constants/dataset";

export const DIMENSIONS = {
  maxSideLength: 550,
  padding: {
    legend: 16,
    side: 12,
  },
  slice: {
    innerRadiusRatio: 3 / 5,
    twoRingInnerRadiusRatio: 2 / 5,
    threeRingInnerRadiusRatio: 1 / 4,
    borderProportion: 360, // 1 degree
    twoRingBorderWidth: 1,
    threeRingBorderWidth: 0.3,
    maxFontSize: 20,
    minFontSize: 14,
    multiRingFontSize: 12,
    label: {
      fontWeight: 700,
      padding: 2,
    },
  },
  total: {
    valueFontSize: 22,
    labelFontSize: 14,
    fontWeight: 700,
  },
};

export const SLICE_THRESHOLD = 0.025; // approx 1 degree in percentage

export const OTHER_SLICE_MIN_PERCENTAGE = 0.005;

export const OTHER_SLICE_KEY = `${NULL_CHAR}___OTHER___`;

export const getOtherSliceName = () => t`Other`;

export const getTotalText = () => t`Total`.toUpperCase();

export const OPTION_NAME_SEPERATOR = `–${NULL_CHAR}–`;
