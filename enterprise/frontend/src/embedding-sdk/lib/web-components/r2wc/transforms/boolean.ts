import type { Transform } from "./transforms";

export const booleanTransform: Transform<boolean> = {
  stringify: (value) => (value ? "true" : "false"),
  parse: (value) => /^[ty1-9]/i.test(value),
};
