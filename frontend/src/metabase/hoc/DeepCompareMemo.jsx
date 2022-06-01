import { memo } from "react";
import _ from "underscore";

function areEqual(left, right, shouldCompareDeep) {
  if (left === right || (isNaN(left) && isNaN(right))) {
    return true;
  }

  if (shouldCompareDeep) {
    return _.isEqual(left, right);
  }

  return false;
}

export const withDeepCompareMemo = (Component, deepCompareKeys) => {
  const deepCompareKeysSet = new Set(deepCompareKeys);

  return memo(Component, (prevProps, nextProps) => {
    if (prevProps === nextProps) {
      return true;
    }

    const prevKeys = Object.keys(prevProps);
    const nextKeys = Object.keys(nextProps);

    if (prevKeys.length !== nextKeys.length) {
      return false;
    }

    for (let i = 0; i < prevKeys.length; i++) {
      const currentKey = prevKeys[i];

      const hasSameKey = Object.prototype.hasOwnProperty.call(
        nextProps,
        currentKey,
      );

      if (
        !hasSameKey ||
        !areEqual(
          prevProps[currentKey],
          nextProps[currentKey],
          deepCompareKeysSet.has(currentKey),
        )
      ) {
        return false;
      }
    }

    return true;
  });
};
