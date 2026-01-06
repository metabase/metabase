import { isNumber } from "metabase/lib/types";
import type { NumericScale } from "metabase-types/api";

import type { NumericAxisScaleTransforms } from "./types";

function getSign(value: number) {
  return value >= 0 ? 1 : -1;
}

export function signedSquareRoot(value: number) {
  return getSign(value) * Math.sqrt(Math.abs(value));
}

/**
 * Symmetric log (symlog) transformation that handles:
 * - Negative values (symmetric around zero)
 * - Values between -1 and 1 (linear region)
 * - Values with |x| >= 1 (logarithmic region)
 */
const signedLog = (value: number) => {
  const absValue = Math.abs(value);
  if (absValue < 1) {
    return value;
  }
  return getSign(value) * (1 + Math.log10(absValue));
};

const inverseSignedLog = (value: number) => {
  const absValue = Math.abs(value);
  if (absValue < 1) {
    return value;
  }
  return getSign(value) * Math.pow(10, absValue - 1);
};

export function getAxisTransforms(
  scale: NumericScale | undefined,
): NumericAxisScaleTransforms {
  if (scale === "pow") {
    return {
      toEChartsAxisValue: (value) => {
        if (!isNumber(value)) {
          return null;
        }
        return signedSquareRoot(value);
      },
      fromEChartsAxisValue: (value) => {
        return Math.pow(value, 2) * getSign(value);
      },
    };
  }
  if (scale === "log") {
    return {
      toEChartsAxisValue: (value) => {
        if (!isNumber(value)) {
          return null;
        }

        return signedLog(value);
      },
      fromEChartsAxisValue: inverseSignedLog,
    };
  }

  return {
    toEChartsAxisValue: (value) => {
      if (!isNumber(value)) {
        return null;
      }
      return value;
    },
    fromEChartsAxisValue: (value) => value,
  };
}
