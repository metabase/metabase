import { t } from "ttag";

import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { Expression } from "metabase-types/api";

import { type CompileResult, compileExpression } from "./compiler";
import { MBQL_CLAUSES, getMBQLName } from "./config";
import { OPERATOR, TOKEN, tokenize } from "./tokenizer";
import type { ErrorWithMessage, StartRule, Token } from "./types";
import { getDatabase, getExpressionMode, isErrorWithMessage } from "./utils";

export function diagnose(options: {
  source: string;
  startRule: StartRule;
  query: Lib.Query;
  stageIndex: number;
  metadata?: Metadata;
}) {
  const result = diagnoseAndCompile(options);
  if ("error" in result) {
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
}: {
  source: string;
  startRule: StartRule;
  query: Lib.Query;
  stageIndex: number;
  metadata?: Metadata;
}): CompileResult {
  if (!source || source.length === 0) {
    return {
      error: { message: t`Expression is empty` },
    };
  }

  const { tokens, errors } = tokenize(source);
  if (errors && errors.length > 0) {
    return { error: errors[0] };
  }

  {
    const error = checkOpenParenthesisAfterFunction(source, tokens);
    if (error) {
      console.warn("Error with checkOpenParenthesisAfterFunction", error);
      return { error };
    }
  }

  {
    const error = checkMatchingParentheses(tokens);
    if (error) {
      console.warn("Error with parentheses", error);
      return { error };
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

  if ("error" in result) {
    console.warn("Error compiling the expression", result.error);
    return result;
  }

  const error = checkCompiledExpression({
    query,
    stageIndex,
    startRule,
    expression: result.expression,
  });
  if (error) {
    console.warn("Error checking the expression", error);
    return { error };
  }
  return result;
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
    const error = Lib.diagnoseExpression(
      query,
      stageIndex,
      getExpressionMode(startRule),
      expression,
      expressionIndex,
    );

    if (error) {
      throw error;
    }
  } catch (error) {
    console.warn("diagnostic error", error);

    // diagnoseExpression returns some messages which are user-friendly and
    // some which are not. If the `friendly` flag is true, we can use the
    // error as-is; if not then use a generic message.
    if (isErrorWithMessage(error) && error.friendly) {
      return error;
    }
    return { message: t`Invalid expression` };
  }
  return null;
}
