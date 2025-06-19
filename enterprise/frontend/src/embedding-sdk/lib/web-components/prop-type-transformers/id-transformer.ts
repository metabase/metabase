import { isNumericID } from "metabase-types/api";

import type { PropTypeTransformer } from "./types";

export const idTransformer: PropTypeTransformer<string | number> = (
  value: string,
) => {
  if (isNumericID(value)) {
    return parseInt(value, 10);
  }

  return value.toString();
};
