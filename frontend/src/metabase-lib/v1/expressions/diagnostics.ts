import { t } from "ttag";

import * as Lib from "metabase-lib";
import type { Expr, Node } from "metabase-lib/v1/expressions/pratt";
import {
  parse,
  lexify,
  compile,
  ResolverError,
} from "metabase-lib/v1/expressions/pratt";
import type Database from "metabase-lib/v1/metadata/Database";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import {
  useShorthands,
  adjustCase,
  adjustOptions,
  adjustOffset,
} from "./recursive-parser";
import { LOGICAL_OPS, COMPARISON_OPS, resolve } from "./resolver";
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
  query,
  stageIndex,
  metadata,
  name = null,
  expressionIndex,
}: {
  source: string;
  startRule: "expression" | "aggregation" | "boolean";
  query: Lib.Query;
  stageIndex: number;
  name?: string | null;
  metadata?: Metadata;
  expressionIndex: number | undefined;
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

  const database = getDatabase(query, metadata);

  // make a simple check on expression syntax correctness
  let mbqlOrError: Expr | ErrorWithMessage;
  try {
    mbqlOrError = prattCompiler({
      source,
      startRule,
      name,
      query,
      stageIndex,
      expressionIndex,
      database,
    });

    if (isErrorWithMessage(mbqlOrError)) {
      return mbqlOrError;
    }

    if (startRule === "expression" && isBooleanExpression(mbqlOrError)) {
      throw new ResolverError(
        t`Custom columns do not support boolean expressions`,
        mbqlOrError.node,
      );
    }
  } catch (err) {
    if (isErrorWithMessage(err)) {
      return err;
    }

    return { message: t`Invalid expression` };
  }

  // now make a proper check
  const startRuleToExpressionModeMapping: Record<string, Lib.ExpressionMode> = {
    boolean: "filter",
  };

  const expressionMode: Lib.ExpressionMode =
    startRuleToExpressionModeMapping[startRule] ?? startRule;

  try {
    const possibleError = Lib.diagnoseExpression(
      query,
      stageIndex,
      expressionMode,
      mbqlOrError,
      expressionIndex,
    );

    if (possibleError) {
      console.warn("diagnostic error", possibleError.message);

      // diagnoseExpression returns some messages which are user-friendly and some which are not.
      // If the `friendly` flag is true, we can use the possibleError as-is; if not then use a generic message.
      return possibleError.friendly
        ? possibleError
        : { message: t`Invalid expression` };
    }
  } catch (error) {
    console.warn("diagnostic error", error);
    return { message: t`Invalid expression` };
  }

  return null;
}

function prattCompiler({
  source,
  startRule,
  name,
  query,
  stageIndex,
  expressionIndex,
  database,
}: {
  source: string;
  startRule: string;
  name: string | null;
  query: Lib.Query;
  stageIndex: number;
  expressionIndex: number | undefined;
  database?: Database | null;
}): ErrorWithMessage | Expr {
  const tokens = lexify(source);
  const options = {
    source,
    startRule,
    name,
    query,
    stageIndex,
    expressionIndex,
  };

  // PARSE
  const { root, errors } = parse(tokens, {
    throwOnError: false,
    ...options,
  });

  if (errors.length > 0) {
    return errors[0];
  }

  function resolveMBQLField(kind: string, name: string, node: Node) {
    // @uladzimirdev double check why is this needed
    if (!query) {
      return [kind, name];
    }
    if (kind === "metric") {
      const metric = parseMetric(name, options);
      if (!metric) {
        throw new ResolverError(t`Unknown Metric: ${name}`, node);
      }

      return Lib.legacyRef(query, stageIndex, metric);
    } else if (kind === "segment") {
      const segment = parseSegment(name, options);
      if (!segment) {
        throw new ResolverError(t`Unknown Segment: ${name}`, node);
      }

      return Lib.legacyRef(query, stageIndex, segment);
    } else {
      // fallback
      const dimension = parseDimension(name, options);
      if (!dimension) {
        throw new ResolverError(t`Unknown Field: ${name}`, node);
      }

      return Lib.legacyRef(query, stageIndex, dimension);
    }
  }

  // COMPILE
  const mbql = compile(root, {
    passes: [
      adjustOptions,
      useShorthands,
      adjustOffset,
      adjustCase,
      expression =>
        resolve({
          expression,
          type: startRule,
          fn: resolveMBQLField,
          database,
        }),
    ],
    getMBQLName,
  });

  return mbql;
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

function getDatabase(query: Lib.Query, metadata?: Metadata) {
  const databaseId = Lib.databaseID(query);
  return metadata?.database(databaseId);
}
