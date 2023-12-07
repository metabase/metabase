import { t } from "ttag";

import type { Expr, Node } from "metabase-lib/expressions/pratt";
import {
  parse,
  lexify,
  compile,
  ResolverError,
} from "metabase-lib/expressions/pratt";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import { LOGICAL_OPS, COMPARISON_OPS, resolve } from "./resolver";
import { useShorthands, adjustCase, adjustOptions } from "./recursive-parser";
import { tokenize, TOKEN, OPERATOR } from "./tokenizer";
import type { ErrorWithMessage } from "./types";
import {
  MBQL_CLAUSES,
  getMBQLName,
  parseDimension,
  parseMetric,
  parseSegment,
} from "./index";

type Token = {
  type: number;
  op: string;
  start: number;
  end: number;
};

// e.g. "COUNTIF(([Total]-[Tax] <5" returns 2 (missing parentheses)
export function countMatchingParentheses(tokens: Token[]) {
  const isOpen = (t: Token) => t.op === OPERATOR.OpenParenthesis;
  const isClose = (t: Token) => t.op === OPERATOR.CloseParenthesis;
  const count = (c: number, token: Token) =>
    isOpen(token) ? c + 1 : isClose(token) ? c - 1 : c;
  return tokens.reduce(count, 0);
}

export function diagnose({
  source,
  startRule,
  legacyQuery,
  name = null,
}: {
  source: string;
  startRule: string;
  legacyQuery: StructuredQuery;
  name?: string | null;
}): ErrorWithMessage | null {
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
      const fn = getMBQLName(functionName);
      const clause = fn ? MBQL_CLAUSES[fn] : null;
      if (clause && clause.args.length > 0) {
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
    return prattCompiler(source, startRule, legacyQuery, name);
  } catch (err) {
    if (isErrorWithMessage(err)) {
      return err;
    }

    return { message: t`Invalid expression` };
  }
}

function prattCompiler(
  source: string,
  startRule: string,
  legacyQuery: StructuredQuery,
  name: string | null,
): ErrorWithMessage | null {
  const tokens = lexify(source);
  const options = { source, startRule, legacyQuery, name };

  // PARSE
  const { root, errors } = parse(tokens, {
    throwOnError: false,
    ...options,
  });
  if (errors.length > 0) {
    return errors[0];
  }

  function resolveMBQLField(kind: string, name: string, node: Node) {
    if (!legacyQuery) {
      return [kind, name];
    }
    if (kind === "metric") {
      const metric = parseMetric(name, options);
      if (!metric) {
        throw new ResolverError(t`Unknown Metric: ${name}`, node);
      }
      return ["metric", metric.id];
    } else if (kind === "segment") {
      const segment = parseSegment(name, options);
      if (!segment) {
        throw new ResolverError(t`Unknown Segment: ${name}`, node);
      }
      return Array.isArray(segment.id) ? segment.id : ["segment", segment.id];
    } else {
      const reference = options.name ?? ""; // avoid circular reference

      // fallback
      const dimension = parseDimension(name, { reference, ...options });
      if (!dimension) {
        throw new ResolverError(t`Unknown Field: ${name}`, node);
      }
      return dimension.mbql();
    }
  }

  // COMPILE
  try {
    const expression = compile(root, {
      passes: [
        adjustOptions,
        useShorthands,
        adjustCase,
        expr => resolve(expr, startRule, resolveMBQLField),
      ],
      getMBQLName,
    });
    const isBoolean = isBooleanExpression(expression);
    if (startRule === "expression" && isBoolean) {
      throw new ResolverError(
        t`Custom columns do not support boolean expressions`,
        expression.node,
      );
    }
  } catch (err) {
    console.warn("compile error", err);

    if (isErrorWithMessage(err)) {
      return err;
    }

    return { message: t`Invalid expression` };
  }

  return null;
}

function isBooleanExpression(
  expr: unknown,
): expr is [string, ...Expr[]] & { node?: Node } {
  return (
    Array.isArray(expr) &&
    (LOGICAL_OPS.includes(expr[0]) || COMPARISON_OPS.includes(expr[0]))
  );
}

function isErrorWithMessage(err: unknown): err is ErrorWithMessage {
  return (
    typeof err === "object" &&
    err != null &&
    typeof (err as any).message === "string"
  );
}
