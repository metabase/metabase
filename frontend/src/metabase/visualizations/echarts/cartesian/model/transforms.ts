import type { NumericScale, StackType } from "metabase-types/api";
import { isNumber } from "metabase/lib/types";
import type { NumericAxisScaleTransforms } from "./types";

function getSign(value: number) {
  return value >= 0 ? 1 : -1;
}

export function signedSquareRoot(value: number) {
  return getSign(value) * Math.sqrt(Math.abs(value));
}

export function getYAxisScaleTransforms(
  scale: NumericScale | undefined,
  stackType?: StackType,
): NumericAxisScaleTransforms {
  if (scale === "pow") {
    return {
      toEChartsAxisValue: value => {
        if (!isNumber(value)) {
          return null;
        }
        // Transformation for stacked charts occurs in model/dataset.ts
        if (stackType != null) {
          return value;
        }
        return signedSquareRoot(value);
      },
      fromEChartsAxisValue: value => {
        return Math.pow(value, 2) * getSign(value);
      },
    };
  }
  // TODO re-implement log y-axis scale

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
