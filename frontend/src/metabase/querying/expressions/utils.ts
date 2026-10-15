import { CompileError } from "./errors";
import type { Node } from "./pratt";

/**
 * Assert compiler invariants and assumptions.
 * Throws a non-friendly error if the condition is false.
 */
export function assert(
  condition: any,
  msg: string,
  data?: any,
): asserts condition {
  if (!condition) {
    throw new Error(msg, data || {});
  }
}

/**
 * Check assumptions that might fail based on the query source.
 * Throws a user-friendly error if the condition is false.
 */
export function check(
  condition: any,
  msg: string,
  node: Node,
): asserts condition {
  if (!condition) {
    throw new CompileError(msg, node);
  }
}
