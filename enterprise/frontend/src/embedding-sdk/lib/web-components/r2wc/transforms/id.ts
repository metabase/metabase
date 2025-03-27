import { isNumericID } from "metabase-types/api";

import type { Transform } from "./transforms";

export const idTransform: Transform<string | number> = {
  stringify: (value) => value.toString(),
  parse: (value) => {
    if (isNumericID(value)) {
      return parseInt(value, 10);
    }

    return value.toString();
  },
};
