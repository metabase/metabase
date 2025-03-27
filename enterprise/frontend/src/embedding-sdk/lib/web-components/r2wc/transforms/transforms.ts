import { booleanTransform } from "./boolean";
import { functionTransform } from "./function";
import { idTransform } from "./id";
import { jsonTransform } from "./json";
import { noopTransform } from "./noop";
import { numberTransform } from "./number";
import { stringTransform } from "./string";

export interface Transform<TValue> {
  stringify: (value: TValue) => string;
  parse: (value: string) => TValue;
}

export const transforms = {
  id: idTransform,
  string: stringTransform,
  number: numberTransform,
  boolean: booleanTransform,
  function: functionTransform,
  json: jsonTransform,
  noop: noopTransform,
};
