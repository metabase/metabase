import type { Transform } from "./transforms";

export const noopTransform: Transform<undefined> = {
  stringify: () => "",
  parse: () => undefined,
};
