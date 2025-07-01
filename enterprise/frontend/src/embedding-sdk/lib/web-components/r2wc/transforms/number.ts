import type { Transform } from "./transforms";

export const numberTransform: Transform<number> = {
  stringify: (value) => `${value}`,
  parse: (value) => parseFloat(value),
};
