import { getMBQLName } from "../config";
import {
  adjustCaseOrIf,
  adjustMultiArgOptions,
  adjustOffset,
  adjustOptions,
  useShorthands,
} from "../passes";

import { lexify, compile as newCompile, parse } from ".";

export function compile(source: string) {
  const passes = [
    adjustOptions,
    useShorthands,
    adjustOffset,
    adjustCaseOrIf,
    adjustMultiArgOptions,
  ];

  const ast = parse(lexify(source), {
    throwOnError: true,
  });

  return newCompile(ast.root, {
    passes,
    getMBQLName,
  });
}
