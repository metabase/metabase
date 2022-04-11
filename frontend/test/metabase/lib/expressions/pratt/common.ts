import {
  lexify,
  parse,
  compile as newCompile,
  Expr,
} from "metabase/lib/expressions/pratt";
import { resolve } from "metabase/lib/expressions/resolver";
import { getMBQLName } from "metabase/lib/expressions/config";
import {
  parse as oldParser,
  useShorthands,
  adjustCase,
  adjustOptions,
} from "metabase/lib/expressions/recursive-parser";

import { generateExpression } from "../generator";

type Type = "expression" | "boolean";

interface Opts {
  throwOnError?: boolean;
  resolverPass?: boolean;
}

export function compile(source: string, type: Type, opts: Opts = {}) {
  const { throwOnError } = opts;
  const passes = [adjustOptions, useShorthands, adjustCase];
  return newCompile(
    parse(lexify(source), {
      throwOnError,
    }).root,
    {
      passes: opts.resolverPass
        ? [...passes, expr => resolve(expr, type, mockResolve as any)]
        : passes,
      getMBQLName,
    },
  );
}

export function mockResolve(kind: any, name: string): Expr {
  return ["dimension", name];
}

export function oracle(source: string, type: Type) {
  let mbql = null;
  try {
    mbql = oldParser(source);
  } catch (e) {
    let err = e as any;
    if (err.length && err.length > 0) {
      err = err[0];
      if (typeof err.message === "string") {
        err = err.message;
      }
    }
    throw err;
  }
  return resolve(mbql, type, mockResolve as any);
}

export function compare(
  source: string,
  type: Type,
  opts: Opts = {},
): { oracle: any; compiled: any } {
  const _oracle = oracle(source, type);
  const compiled = compile(source, type, opts);
  return { oracle: _oracle, compiled };
}

export function compareSeed(
  seed: number,
  type: Type,
  opts: Opts = {},
): { oracle: any; compiled: any } {
  const { expression } = generateExpression(seed, type);
  const _oracle = oracle(expression, type);
  const compiled = compile(expression, type, opts);
  return { oracle: _oracle, compiled };
}
