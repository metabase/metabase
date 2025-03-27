import type { Transform } from "./transforms";

export const stringTransform: Transform<string> = {
  stringify: (value) => value,
  parse: (value) => value,
};
