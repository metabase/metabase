import { t } from "ttag";

import {
  getMBQLName,
  parseDimension,
  parseMetric,
  parseSegment,
} from "metabase/lib/expressions";
import { resolve } from "metabase/lib/expressions/resolver";
import {
  parse,
  lexify,
  compile,
  ResolverError,
} from "metabase/lib/expressions/pratt";
import {
  useShorthands,
  adjustCase,
  adjustOptions,
} from "metabase/lib/expressions/recursive-parser";
import { tokenize, TOKEN, OPERATOR } from "metabase/lib/expressions/tokenizer";

// e.g. "COUNTIF(([Total]-[Tax] <5" returns 2 (missing parentheses)
export function countMatchingParentheses(tokens) {
  const isOpen = t => t.op === OPERATOR.OpenParenthesis;
  const isClose = t => t.op === OPERATOR.CloseParenthesis;
  const count = (c, token) =>
    isOpen(token) ? c + 1 : isClose(token) ? c - 1 : c;
  return tokens.reduce(count, 0);
}

export function diagnose(source, startRule, query) {
  if (!source || source.length === 0) {
    return null;
  }

  const { tokens, errors } = tokenize(source);
  if (errors && errors.length > 0) {
    return errors[0];
  }

  for (let i = 0; i < tokens.length - 1; ++i) {
    const token = tokens[i];
    if (token.type === TOKEN.Identifier && source[token.start] !== "[") {
      const functionName = source.slice(token.start, token.end);
      if (getMBQLName(functionName)) {
        const next = tokens[i + 1];
        if (next.op !== OPERATOR.OpenParenthesis) {
          return {
            message: t`Expecting an opening parenthesis after function ${functionName}`,
          };
        }
      }
    }
  }

  const mismatchedParentheses = countMatchingParentheses(tokens);
  const message =
    mismatchedParentheses === 1
      ? t`Expecting a closing parenthesis`
      : mismatchedParentheses > 1
      ? t`Expecting ${mismatchedParentheses} closing parentheses`
      : mismatchedParentheses === -1
      ? t`Expecting an opening parenthesis`
      : mismatchedParentheses < -1
      ? t`Expecting ${-mismatchedParentheses} opening parentheses`
      : null;
  if (message) {
    return { message };
  }

  try {
    return prattCompiler(source, startRule, query);
  } catch (err) {
    return err;
  }
}

function prattCompiler(source, startRule, query) {
  const tokens = lexify(source);
  const options = { source, startRule, query };

  // PARSE
  const { root, errors } = parse(tokens, {
    throwOnError: false,
    ...options,
  });
  if (errors.length > 0) {
    return errors[0];
  }

  function resolveMBQLField(kind, name, node) {
    if (!query) {
      return [kind, name];
    }
    if (kind === "metric") {
      const metric = parseMetric(name, options);
      if (!metric) {
        throw new ResolverError(t`Unknown Field: ${name}`, node);
      }
      return ["metric", metric.id];
    } else if (kind === "segment") {
      const segment = parseSegment(name, options);
      if (!segment) {
        throw new ResolverError(t`Unknown Field: ${name}`, node);
      }
      return ["segment", segment.id];
    } else {
      // fallback
      const dimension = parseDimension(name, options);
      if (!dimension) {
        throw new ResolverError(t`Unknown Field: ${name}`, node);
      }
      return dimension.mbql();
    }
  }

  // COMPILE
  try {
    compile(root, {
      passes: [
        adjustOptions,
        useShorthands,
        adjustCase,
        expr => resolve(expr, startRule, resolveMBQLField),
      ],
      getMBQLName,
    });
  } catch (err) {
    console.warn("compile error", err);
    return err;
  }

  return null;
}
