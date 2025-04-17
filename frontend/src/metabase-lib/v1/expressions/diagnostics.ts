import { msgid, ngettext, t } from "ttag";

import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { Expression } from "metabase-types/api";

import { type CompileResult, compileExpression } from "./compiler";
import {
  COMPARISON_OPERATORS,
  FIELD_MARKERS,
  getClauseDefinition,
  getMBQLName,
} from "./config";
import { DiagnosticError, type ExpressionError, renderError } from "./errors";
import {
  isCallExpression,
  isCaseOrIfOperator,
  isOperator,
  isOptionsObject,
} from "./matchers";
import {
  CALL,
  FIELD,
  GROUP,
  GROUP_CLOSE,
  IDENTIFIER,
  OPERATORS,
  type Token,
  lexify,
} from "./pratt";
import type { OPERATOR } from "./tokenizer";
import type { StartRule } from "./types";
import { getDatabase, getExpressionMode, getToken } from "./utils";
import { visit } from "./visitor";

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

    const { tokens, errors } = lexify(source);
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

    // make a simple check on expression syntax correctness
    const result = compileExpression({
      source,
      startRule,
      query,
      stageIndex,
    });

    if (result.expression === null || result.expressionClause === null) {
      const error = result.error ?? new DiagnosticError(t`Invalid expression`);
      throw error;
    }

    diagnoseExpression({
      query,
      stageIndex,
      startRule,
      expression: result.expression,
      expressionIndex,
      metadata,
    });

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
    if (token.type === IDENTIFIER && source[token.start] !== "[") {
      const functionName = source.slice(token.start, token.end);
      const fn = getMBQLName(functionName);
      const clause = fn && getClauseDefinition(fn);
      if (clause && clause.args.length > 0) {
        const next = tokens[i + 1];
        if (next.type !== GROUP) {
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
  const isOpen = (t: Token) => t.type === GROUP;
  const isClose = (t: Token) => t.type === GROUP_CLOSE;
  const count = (c: number, token: Token) =>
    isOpen(token) ? c + 1 : isClose(token) ? c - 1 : c;
  return tokens.reduce(count, 0);
}

export function diagnoseExpression({
  query,
  stageIndex,
  startRule,
  expression,
  expressionIndex,
  metadata,
}: {
  query: Lib.Query;
  stageIndex: number;
  startRule: string;
  expression: Expression;
  expressionIndex?: number;
  metadata?: Metadata;
}) {
  const checkers = [
    checkKnownFunctions,
    checkFunctionSupport,
    checkArgValidator,
    checkArgCount,
    checkComparisonOperatorArgs,
    checkCaseOrIfArgCount,
  ];
  for (const checker of checkers) {
    checker({ expression, query, metadata });
  }

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
}

function checkMissingCommasInArgumentList(
  tokens: Token[],
  source: string,
): ExpressionError | null {
  const call = 1;
  const group = 2;
  const stack = [];

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const prevToken = tokens[index - 1];
    if (token?.type === GROUP) {
      if (!prevToken) {
        continue;
      }
      if (prevToken.type === CALL) {
        stack.push(call);
        continue;
      } else {
        stack.push(group);
        continue;
      }
    }
    if (token.type === GROUP_CLOSE) {
      stack.pop();
      continue;
    }

    const isCall = stack.at(-1) === call;
    if (!isCall) {
      continue;
    }

    const nextToken = tokens[index + 1];
    if (token.type === IDENTIFIER || token.type === FIELD) {
      if (nextToken && !OPERATORS.has(nextToken.type)) {
        const text = source.slice(nextToken.start, nextToken.end);
        return new DiagnosticError(
          `Expecting operator but got ${text} instead`,
          nextToken,
        );
      }
    }
  }

  return null;
}

function checkKnownFunctions({ expression }: { expression: Expression }) {
  visit(expression, (node) => {
    if (!isCallExpression(node)) {
      return;
    }

    const name = node[0];
    if (FIELD_MARKERS.has(name) || name === "value" || name === "expression") {
      return;
    }

    const clause = getClauseDefinition(name);
    if (!clause) {
      throw new DiagnosticError(t`Unknown function ${name}`, getToken(node));
    }
  });
}

function checkFunctionSupport({
  query,
  expression,
  metadata,
}: {
  expression: Expression;
  query: Lib.Query;
  metadata?: Metadata;
}) {
  if (!metadata) {
    return;
  }

  const database = getDatabase(query, metadata);
  if (!database) {
    return;
  }

  visit(expression, (node) => {
    if (!isCallExpression(node)) {
      return;
    }
    const [name] = node;
    const clause = getClauseDefinition(name);
    if (!clause) {
      return;
    }
    if (!database?.hasFeature(clause.requiresFeature)) {
      throw new DiagnosticError(
        t`Unsupported function ${name}`,
        getToken(node),
      );
    }
  });
}

function checkArgValidator({ expression }: { expression: Expression }) {
  visit(expression, (node) => {
    if (!isCallExpression(node)) {
      return;
    }
    const [name, ...operands] = node;
    const clause = getClauseDefinition(name);
    if (!clause) {
      return;
    }

    if (clause.validator) {
      const args = operands.filter((arg) => !isOptionsObject(arg));
      const validationError = clause.validator(...args);
      if (validationError) {
        throw new DiagnosticError(validationError, getToken(node));
      }
    }
  });
}

function checkArgCount({ expression }: { expression: Expression }) {
  visit(expression, (node) => {
    if (!isCallExpression(node)) {
      return;
    }

    const [name, ...operands] = node;
    const clause = getClauseDefinition(name);
    if (!clause || name === "case" || name === "if") {
      return;
    }

    const { displayName, args, multiple, hasOptions } = clause;

    const filtered = operands.filter(
      (arg) => !isOptionsObject(arg) && arg !== null,
    );

    if (multiple) {
      const argCount = filtered.length;
      const minArgCount = args.length;

      if (argCount < minArgCount) {
        throw new DiagnosticError(
          ngettext(
            msgid`Function ${displayName} expects at least ${minArgCount} argument`,
            `Function ${displayName} expects at least ${minArgCount} arguments`,
            minArgCount,
          ),
          getToken(node),
        );
      }
    } else {
      const expectedArgsLength = args.length;
      const maxArgCount = hasOptions
        ? expectedArgsLength + 1
        : expectedArgsLength;
      if (
        filtered.length < expectedArgsLength ||
        filtered.length > maxArgCount
      ) {
        throw new DiagnosticError(
          ngettext(
            msgid`Function ${displayName} expects ${expectedArgsLength} argument`,
            `Function ${displayName} expects ${expectedArgsLength} arguments`,
            expectedArgsLength,
          ),
          getToken(node),
        );
      }
    }
  });
}

function checkComparisonOperatorArgs({
  expression,
}: {
  expression: Expression;
}) {
  visit(expression, (node) => {
    if (!isOperator(node)) {
      return;
    }
    const [name, ...operands] = node;
    if (!COMPARISON_OPERATORS.has(name as OPERATOR)) {
      return;
    }
    const [firstOperand] = operands;
    if (typeof firstOperand === "number") {
      throw new DiagnosticError(
        t`Expecting field but found ${firstOperand}`,
        getToken(node),
      );
    }
  });
}

function checkCaseOrIfArgCount({ expression }: { expression: Expression }) {
  visit(expression, (node) => {
    if (!isCallExpression(node)) {
      return;
    }
    const [op] = node;
    if (!isCaseOrIfOperator(op)) {
      return;
    }

    const pairs = node[1] as [Expression, Expression][];

    if (pairs.length < 1) {
      throw new DiagnosticError(
        t`${op.toUpperCase()} expects 2 arguments or more`,
        getToken(node),
      );
    }
  });
}
