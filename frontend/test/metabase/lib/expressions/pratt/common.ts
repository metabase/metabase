import { getMBQLName } from "metabase-lib/v1/expressions/config";
import type { Expr } from "metabase-lib/v1/expressions/pratt";
import {
  lexify,
  parse,
  compile as newCompile,
} from "metabase-lib/v1/expressions/pratt";
import {
  parse as oldParser,
  useShorthands,
  adjustCase,
  adjustOffset,
  adjustOptions,
} from "metabase-lib/v1/expressions/recursive-parser";
import { resolve } from "metabase-lib/v1/expressions/resolver";

import { generateExpression } from "../generator";

type Type = "expression" | "boolean";

interface Opts {
  throwOnError?: boolean;
  resolverPass?: boolean;
}

export function compile(source: string, type: Type, opts: Opts = {}) {
  const { throwOnError } = opts;
  const passes = [adjustOptions, useShorthands, adjustOffset, adjustCase];
  return newCompile(
    parse(lexify(source), {
      throwOnError,
    }).root,
    {
      passes: opts.resolverPass
        ? [
            ...passes,
            expression => resolve({ expression, type, fn: mockResolve }),
          ]
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
  return resolve({ expression: mbql, type, fn: mockResolve });
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
