import { parse } from "metabase/lib/expressions/parser";
import { compile } from "metabase/lib/expressions/compile";
import { suggest } from "metabase/lib/expressions/suggest";
import { syntax } from "metabase/lib/expressions/syntax";

// combine compile/suggest/syntax so we only need to parse once
export function processSource(options) {
  const { source, targetOffset } = options;

  let expression;
  let suggestions = [];
  let helpText;
  let syntaxTree;
  let compileError;

  // PARSE
  const { cst, tokenVector, parserErrors } = parse({
    ...options,
    recover: true,
  });

  // COMPILE
  if (parserErrors.length > 0) {
    compileError = parserErrors;
  } else {
    try {
      expression = compile({ cst, tokenVector, ...options });
    } catch (e) {
      console.warn("compile error", e);
      compileError = e;
    }
  }

  // SUGGEST
  if (targetOffset != null) {
    try {
      ({ suggestions = [], helpText } = suggest({
        cst,
        tokenVector,
        ...options,
      }));
    } catch (e) {
      console.warn("suggest error", e);
    }
  }

  // SYNTAX
  try {
    syntaxTree = syntax({ cst, tokenVector, ...options });
  } catch (e) {
    console.warn("syntax error", e);
  }

  return {
    source,
    expression,
    helpText,
    suggestions,
    syntaxTree,
    compileError,
  };
}
