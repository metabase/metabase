import { isNumber } from "metabase/lib/types";
import type { NumericScale } from "metabase-types/api";

import type { NumericAxisScaleTransforms } from "./types";

function getSign(value: number) {
  return value >= 0 ? 1 : -1;
}

export function signedSquareRoot(value: number) {
  return getSign(value) * Math.sqrt(Math.abs(value));
}

export function signedLog(value: number) {
  return getSign(value) * Math.log10(Math.abs(value));
}

export function getAxisTransforms(
  scale: NumericScale | undefined,
): NumericAxisScaleTransforms {
  if (scale === "pow") {
    return {
      toEChartsAxisValue: value => {
        if (!isNumber(value)) {
          return null;
        }
        return signedSquareRoot(value);
      },
      fromEChartsAxisValue: value => {
        return Math.pow(value, 2) * getSign(value);
      },
    };
  }
  if (scale === "log") {
    return {
      toEChartsAxisValue: value => {
        if (!isNumber(value)) {
          return null;
        }

        if (value === 0) {
          return value;
        }

        return signedLog(value);
      },
      fromEChartsAxisValue: value => {
        return Math.pow(10, Math.abs(value)) * getSign(value);
      },
    };
  }

  return {
    toEChartsAxisValue: value => {
      if (!isNumber(value)) {
        return null;
      }
      return value;
    },
    fromEChartsAxisValue: value => value,
  };
}
