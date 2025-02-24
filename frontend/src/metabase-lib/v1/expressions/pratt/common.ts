import type { Expression } from "metabase-types/api";

import { getMBQLName } from "../config";
import {
  adjustCaseOrIf,
  adjustMultiArgOptions,
  adjustOffset,
  adjustOptions,
  useShorthands,
} from "../passes";
import { resolve } from "../resolver";

import { lexify, compile as newCompile, parse } from ".";

type Type = "expression" | "boolean";

interface Opts {
  throwOnError?: boolean;
  resolverPass?: boolean;
}

export function compile(source: string, type: Type, opts: Opts = {}) {
  const { throwOnError } = opts;
  const passes = [
    adjustOptions,
    useShorthands,
    adjustOffset,
    adjustCaseOrIf,
    adjustMultiArgOptions,
  ];
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

function mockResolve(_kind: any, name: string): Expression {
  return ["dimension", name];
}
