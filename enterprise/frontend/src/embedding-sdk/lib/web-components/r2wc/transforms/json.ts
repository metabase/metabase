import { functionTransform } from "./function";
import type { Transform } from "./transforms";

export const jsonTransform: Transform<unknown> = {
  stringify: (value) => {
    return JSON.stringify(value, (_, value) => {
      if (typeof value === "function") {
        return functionTransform.stringify(value);
      }

      return value;
    });
  },
  parse: (value) => {
    if (!value) {
      return undefined;
    }

    return JSON.parse(value, (key, value) => {
      if (typeof window[value] === "function") {
        return functionTransform.parse(value);
      }

      return value;
    });
  },
};
