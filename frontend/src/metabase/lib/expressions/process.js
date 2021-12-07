// combine compile/suggest/syntax so we only need to parse once
export function processSource(options) {
  // Lazily load all these parser-related stuff, because parser construction is expensive
  // https://github.com/metabase/metabase/issues/13472
  const parse = require("./parser").parse;
  const compile = require("./compile").compile;

  const { source } = options;

  let expression;
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

  return {
    source,
    expression,
    compileError,
  };
}
