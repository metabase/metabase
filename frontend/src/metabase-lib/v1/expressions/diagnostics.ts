import { c, t } from "ttag";

import * as Lib from "metabase-lib";
import type { Node } from "metabase-lib/v1/expressions/pratt";
import {
  ResolverError,
  compile,
  lexify,
  parse,
} from "metabase-lib/v1/expressions/pratt";
import type Database from "metabase-lib/v1/metadata/Database";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { Expression } from "metabase-types/api";

import { MBQL_CLAUSES, getMBQLName } from "./config";
import { parseDimension, parseMetric, parseSegment } from "./identifier";
import {
  adjustCaseOrIf,
  adjustMultiArgOptions,
  adjustOffset,
  adjustOptions,
  useShorthands,
} from "./recursive-parser";
import { resolve } from "./resolver";
import { OPERATOR, TOKEN, tokenize } from "./tokenizer";
import type { ErrorWithMessage, Token } from "./types";
import { getDatabase, isErrorWithMessage } from "./utils";

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
  expressionIndex?: number | undefined;
}): ErrorWithMessage | null {
  if (!source || source.length === 0) {
    return null;
  }

  const { tokens, errors } = tokenize(source);
  if (errors && errors.length > 0) {
    return errors[0];
  }

  {
    const error = checkOpenParenthesisAfterFunction(source, tokens);
    if (error) {
      return error;
    }
  }

  {
    const error = checkMatchingParentheses(tokens);
    if (error) {
      return error;
    }
  }

  const database = getDatabase(query, metadata);

  // make a simple check on expression syntax correctness
  const res = prattCompiler({
    source,
    startRule,
    name,
    query,
    stageIndex,
    expressionIndex,
    database,
  });

  if ("error" in res) {
    return res.error;
  }

  const error = checkCompiledExpression({
    query,
    stageIndex,
    startRule,
    expression: res.expression,
    expressionIndex,
  });
  if (error) {
    return error;
  }

  return null;
}

const startRuleToExpressionModeMapping: Record<string, Lib.ExpressionMode> = {
  boolean: "filter",
};

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
  expressionIndex?: number | undefined;
  database?: Database | null;
}):
  | {
      expression: Expression;
    }
  | {
      error: ErrorWithMessage;
    } {
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
    return { error: errors[0] };
  }

  function resolveMBQLField(kind: string, name: string, node: Node) {
    // @uladzimirdev double check why is this needed
    if (!query) {
      return [kind, name];
    }
    if (kind === "metric") {
      const metric = parseMetric(name, options);
      if (!metric) {
        const dimension = parseDimension(name, options);
        const isNameKnown = Boolean(dimension);

        if (isNameKnown) {
          const error = c(
            "{0} is an identifier of the field provided by user in a custom expression",
          )
            .t`No aggregation found in: ${name}. Use functions like Sum() or custom Metrics`;

          throw new ResolverError(error, node);
        }

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

  try {
    // COMPILE
    const mbql = compile(root, {
      passes: [
        adjustOptions,
        useShorthands,
        adjustOffset,
        adjustCaseOrIf,
        adjustMultiArgOptions,
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

    return { expression: mbql };
  } catch (error) {
    if (isErrorWithMessage(error)) {
      return { error };
    }
    return { error: { message: t`Invalid expression` } };
  }
}

function checkOpenParenthesisAfterFunction(
  source: string,
  tokens: Token[],
): ErrorWithMessage | null {
  for (let i = 0; i < tokens.length - 1; ++i) {
    const token = tokens[i];
    if (token.type === TOKEN.Identifier && source[token.start] !== "[") {
      const functionName = source.slice(token.start, token.end);
      const fn = getMBQLName(functionName);
      const clause = fn ? MBQL_CLAUSES[fn] : null;
      if (clause && clause.args.length > 0) {
        const next = tokens[i + 1];
        if (
          next.type !== TOKEN.Operator ||
          next.op !== OPERATOR.OpenParenthesis
        ) {
          return {
            message: t`Expecting an opening parenthesis after function ${functionName}`,
          };
        }
      }
    }
  }

  return null;
}

function checkMatchingParentheses(tokens: Token[]): ErrorWithMessage | null {
  const mismatchedParentheses = countMatchingParentheses(tokens);
  if (mismatchedParentheses === 1) {
    return {
      message: t`Expecting a closing parenthesis`,
    };
  } else if (mismatchedParentheses > 1) {
    return {
      message: t`Expecting ${mismatchedParentheses} closing parentheses`,
    };
  } else if (mismatchedParentheses === -1) {
    return {
      message: t`Expecting an opening parenthesis`,
    };
  } else if (mismatchedParentheses < -1) {
    return {
      message: t`Expecting ${-mismatchedParentheses} opening parentheses`,
    };
  }
  return null;
}

// e.g. "COUNTIF(([Total]-[Tax] <5" returns 2 (missing parentheses)
export function countMatchingParentheses(tokens: Token[]) {
  const isOpen = (t: Token) =>
    t.type === TOKEN.Operator && t.op === OPERATOR.OpenParenthesis;
  const isClose = (t: Token) =>
    t.type === TOKEN.Operator && t.op === OPERATOR.CloseParenthesis;
  const count = (c: number, token: Token) =>
    isOpen(token) ? c + 1 : isClose(token) ? c - 1 : c;
  return tokens.reduce(count, 0);
}

function checkCompiledExpression({
  query,
  stageIndex,
  startRule,
  expression,
  expressionIndex,
}: {
  query: Lib.Query;
  stageIndex: number;
  startRule: string;
  expression: Expression;
  expressionIndex?: number;
}): ErrorWithMessage | null {
  try {
    const expressionMode: Lib.ExpressionMode =
      startRuleToExpressionModeMapping[startRule] ?? startRule;

    const error = Lib.diagnoseExpression(
      query,
      stageIndex,
      expressionMode,
      expression,
      expressionIndex,
    );

    if (error) {
      console.warn("diagnostic error", error.message);

      // diagnoseExpression returns some messages which are user-friendly and some which are not.
      // If the `friendly` flag is true, we can use the possibleError as-is; if not then use a generic message.
      return error.friendly ? error : { message: t`Invalid expression` };
    }
  } catch (error) {
    console.warn("diagnostic error", error);
    return { message: t`Invalid expression` };
  }
  return null;
}
