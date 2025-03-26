import { t } from "ttag";

import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { Expression } from "metabase-types/api";

import { type CompileResult, compileExpression } from "./compiler";
import { MBQL_CLAUSES, getMBQLName } from "./config";
import { DiagnosticError, type ExpressionError, renderError } from "./errors";
import { isExpression } from "./matchers";
import { OPERATOR, TOKEN, tokenize } from "./tokenizer";
import type { StartRule, Token } from "./types";
import { getDatabase, getExpressionMode } from "./utils";

export function diagnose(options: {
  source: string;
  startRule: StartRule;
  query: Lib.Query;
  stageIndex: number;
  expressionIndex?: number;
  metadata?: Metadata;
}): ExpressionError | null {
  const result = diagnoseAndCompile(options);
  if (result.error) {
    return result.error;
  }
  return null;
}

export function diagnoseAndCompile({
  source,
  startRule,
  query,
  stageIndex,
  metadata,
  expressionIndex,
}: {
  source: string;
  startRule: StartRule;
  query: Lib.Query;
  stageIndex: number;
  metadata?: Metadata;
  expressionIndex?: number;
}): CompileResult {
  try {
    if (!source || source.length === 0) {
      throw new DiagnosticError(t`Expression is empty`);
    }

    const { tokens, errors } = tokenize(source);
    if (errors && errors.length > 0) {
      throw errors[0];
    }

    const checks = [
      checkOpenParenthesisAfterFunction,
      checkMatchingParentheses,
      checkMissingCommasInArgumentList,
    ];

    for (const check of checks) {
      const error = check(tokens, source);
      if (error) {
        throw error;
      }
    }

    const database = getDatabase(query, metadata);

    // make a simple check on expression syntax correctness
    const result = compileExpression({
      source,
      startRule,
      query,
      stageIndex,
      database,
    });

    if (!isExpression(result.expression) || result.expressionClause === null) {
      const error = result.error ?? new DiagnosticError(t`Invalid expression`);
      throw error;
    }

    const error = checkCompiledExpression({
      query,
      stageIndex,
      startRule,
      expression: result.expression,
      expressionIndex,
    });
    if (error) {
      throw error;
    }

    return result;
  } catch (error) {
    return {
      expression: null,
      expressionClause: null,
      error: renderError(error),
    };
  }
}

function checkOpenParenthesisAfterFunction(
  tokens: Token[],
  source: string,
): ExpressionError | null {
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
          return new DiagnosticError(
            t`Expecting an opening parenthesis after function ${functionName}`,
            {
              pos: token.start,
              len: token.end - token.start,
            },
          );
        }
      }
    }
  }

  return null;
}

function checkMatchingParentheses(tokens: Token[]): ExpressionError | null {
  const mismatchedParentheses = countMatchingParentheses(tokens);
  if (mismatchedParentheses === 1) {
    return new DiagnosticError(t`Expecting a closing parenthesis`);
  } else if (mismatchedParentheses > 1) {
    return new DiagnosticError(
      t`Expecting ${mismatchedParentheses} closing parentheses`,
    );
  } else if (mismatchedParentheses === -1) {
    return new DiagnosticError(t`Expecting an opening parenthesis`);
  } else if (mismatchedParentheses < -1) {
    return new DiagnosticError(
      t`Expecting ${-mismatchedParentheses} opening parentheses`,
    );
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
}): ExpressionError | null {
  const error = Lib.diagnoseExpression(
    query,
    stageIndex,
    getExpressionMode(startRule),
    expression,
    expressionIndex,
  );

  if (error) {
    throw new DiagnosticError(error.message, {
      friendly: Boolean(error.friendly),
    });
  }
  return null;
}

function checkMissingCommasInArgumentList(
  tokens: Token[],
  source: string,
): ExpressionError | null {
  const CALL = 1;
  const GROUP = 2;
  const stack = [];

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const prevToken = tokens[index - 1];
    if (token.type === TOKEN.Operator && token.op === "(") {
      if (!prevToken) {
        continue;
      }
      if (prevToken.type === TOKEN.Identifier) {
        stack.push(CALL);
        continue;
      } else {
        stack.push(GROUP);
        continue;
      }
    }
    if (token.type === TOKEN.Operator && token.op === ")") {
      stack.pop();
      continue;
    }

    const isCall = stack.at(-1) === CALL;
    if (!isCall) {
      continue;
    }

    const nextToken = tokens[index + 1];
    if (token.type === TOKEN.Identifier) {
      if (nextToken && nextToken.type !== TOKEN.Operator) {
        const text = source.slice(nextToken.start, nextToken.end);
        return new DiagnosticError(
          `Expecting operator but got ${text} instead`,
          {
            pos: nextToken.start,
            len: nextToken.end - nextToken.start,
          },
        );
      }
    }
  }

  return null;
}
