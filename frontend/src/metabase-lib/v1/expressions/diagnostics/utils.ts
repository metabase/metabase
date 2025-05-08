import type * as Lib from "metabase-lib";

import { DiagnosticError } from "../errors";
import type { Node, Token } from "../pratt";

export function error(message: string): never;
export function error(pos: Positionable, message?: string): never;
export function error(
  posOrMessage: string | Positionable,
  message?: string,
): never {
  if (typeof posOrMessage === "string") {
    throw new DiagnosticError(posOrMessage);
  }
  if (typeof message === "string") {
    throw new DiagnosticError(message, position(posOrMessage));
  }

  throw Error("Unreachable");
}

type Positionable =
  | Lib.ExpressionParts
  | Lib.ExpressionArg
  | { node?: Node }
  | { pos: number; len: number }
  | Node
  | Token
  | undefined
  | null;

function position(x: Positionable):
  | {
      pos?: number;
      len?: number;
    }
  | undefined {
  if (typeof x !== "object" || x === null) {
    return undefined;
  }
  if ("node" in x) {
    return position(x.node);
  }
  if ("pos" in x && "len" in x) {
    return { pos: x.pos, len: x.len };
  }
  return undefined;
}
