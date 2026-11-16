import { useState } from "react";
import _ from "underscore";

/** Returns the same object for as long as the value stays deep-equal. */
export function useStableValue<T>(value: T): T {
  const [stableValue, setStableValue] = useState(value);
  if (!_.isEqual(stableValue, value)) {
    setStableValue(value);
    return value;
  }
  return stableValue;
}
