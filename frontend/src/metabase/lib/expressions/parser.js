import { CstParser } from "chevrotain";

import {
  lexer,
  allTokens,
  LParen,
  RParen,
  AdditiveOperator,
  MultiplicativeOperator,
  Case,
  FilterOperator,
  BooleanOperatorBinary,
  BooleanOperatorUnary,
  StringLiteral,
  NumberLiteral,
  Minus,
  Identifier,
  IdentifierString,
  Comma,
  CLAUSE_TOKENS,
  FunctionName,
  lexerWithRecovery,
  isTokenType,
  RecoveryToken,
} from "./lexer";

import { isExpressionType, getFunctionArgType } from ".";

export class ExpressionParser extends CstParser {
  constructor(config = {}) {
    super(allTokens, {
      // reduced for performance reasons
      maxLookahead: 3,
      recoveryEnabled: false,
      // non-standard option we implement ourselves:
      tokenRecoveryEnabled: true,
      ...config,
    });

    const $ = this;

    // START RULES:

    $.RULE("any", returnType => {
      $.OR({
        DEF: [
          {
            GATE: () =>
              !returnType || isExpressionType("aggregation", returnType),
            ALT: () => {
              $.SUBRULE2($.aggregation, { LABEL: "expression" });
            },
          },
          {
            GATE: () => !returnType || isExpressionType("number", returnType),
            ALT: () => {
              // NOTE: can't use $.number due to limited lookhead?
              // $.SUBRULE($.number, { LABEL: "expression" });
              $.SUBRULE($.additionExpression, {
                LABEL: "expression",
                ARGS: [returnType],
              });
            },
          },
          {
            GATE: () => !returnType || isExpressionType("string", returnType),
            ALT: () => {
              $.SUBRULE1($.string, { LABEL: "expression" });
            },
          },
          {
            GATE: () => !returnType || isExpressionType("boolean", returnType),
            ALT: () => {
              $.SUBRULE($.boolean, { LABEL: "expression" });
            },
          },
        ],
        ERR_MSG: returnType,
      });
    });

    // an expression without aggregations in it
    $.RULE("expression", () => {
      $.SUBRULE($.additionExpression, {
        LABEL: "expression",
        ARGS: ["expression"],
      });
    });
    $.RULE("number", () => {
      $.SUBRULE($.additionExpression, {
        LABEL: "expression",
        ARGS: ["number"],
      });
    });
    $.RULE("string", () => {
      $.SUBRULE($.atomicExpression, {
        LABEL: "expression",
        ARGS: ["string"],
      });
    });

    // an expression with aggregations in it
    $.RULE("aggregation", () => {
      $.SUBRULE($.additionExpression, {
        LABEL: "expression",
        ARGS: ["aggregation"],
      });
    });

    // a filter expression
    $.RULE("boolean", () => {
      $.SUBRULE($.booleanExpression, { LABEL: "expression" });
    });

    // EXPRESSIONS:

    // Lowest precedence thus it is first in the rule chain
    // The precedence of binary expressions is determined by
    // how far down the Parse Tree the binary expression appears.
    $.RULE("additionExpression", returnType => {
      $.SUBRULE($.multiplicationExpression, {
        ARGS: [returnType],
        LABEL: "operands",
      });
      $.MANY(() => {
        $.CONSUME(AdditiveOperator, { LABEL: "operators" });
        $.SUBRULE2($.multiplicationExpression, {
          ARGS: [returnType],
          LABEL: "operands",
        });
      });
    });

    $.RULE("multiplicationExpression", returnType => {
      $.SUBRULE($.atomicExpression, {
        ARGS: [returnType],
        LABEL: "operands",
      });
      $.MANY(() => {
        $.CONSUME(MultiplicativeOperator, { LABEL: "operators" });
        $.SUBRULE2($.atomicExpression, {
          ARGS: [returnType],
          LABEL: "operands",
        });
      });
    });

    $.RULE("booleanExpression", () => {
      $.SUBRULE($.atomicExpression, {
        ARGS: ["boolean"],
        LABEL: "operands",
      });
      $.MANY(() => {
        $.CONSUME(BooleanOperatorBinary, { LABEL: "operators" });
        $.SUBRULE2($.atomicExpression, {
          ARGS: ["boolean"],
          LABEL: "operands",
        });
      });
    });

    $.RULE("booleanUnaryExpression", () => {
      $.CONSUME(BooleanOperatorUnary, { LABEL: "operators" });
      $.SUBRULE($.atomicExpression, { LABEL: "operands", ARGS: ["boolean"] });
    });

    $.RULE("comparisonExpression", () => {
      $.SUBRULE($.dimensionExpression, { LABEL: "operands" });
      $.CONSUME(FilterOperator, { LABEL: "operators" });
      $.SUBRULE($.expression, { LABEL: "operands" });
    });

    $.RULE("functionExpression", returnType => {
      $.CONSUME(FunctionName, { LABEL: "functionName" });
      $.OR1([
        {
          GATE: () => {
            const { args } = this._getFnFromToken(this.LA(0));
            return args.length > 0;
          },
          ALT: () => {
            // TODO: this validates the argument types but not the number of arguments?
            const fn = this._getFnFromToken(this.LA(0));
            $.CONSUME(LParen);
            let i = 0;
            $.OPTION(() => {
              $.SUBRULE($.any, {
                LABEL: "arguments",
                ARGS: [getFunctionArgType(fn, i++)],
              });
              $.MANY(() => {
                $.CONSUME(Comma);
                $.SUBRULE1($.any, {
                  LABEL: "arguments",
                  ARGS: [getFunctionArgType(fn, i++)],
                });
              });
            });
            // $.AT_LEAST_ONE_SEP({
            //   SEP: Comma,
            //   DEF: () => {
            //     $.SUBRULE($.any, {
            //       LABEL: "arguments",
            //       ARGS: [getFunctionArgType(fn, i++)],
            //     });
            //   },
            // });
            $.CONSUME(RParen);
          },
        },
        {
          GATE: () => {
            const { args } = this._getFnFromToken(this.LA(0));
            return args.length === 0;
          },
          ALT: () => {
            $.OPTION1(() => {
              $.CONSUME1(LParen);
              $.CONSUME1(RParen);
            });
          },
        },
      ]);
    });

    $.RULE("caseExpression", returnType => {
      $.CONSUME(Case, { LABEL: "functionName" });
      $.CONSUME(LParen);
      $.SUBRULE($.boolean, { LABEL: "arguments" });
      $.CONSUME(Comma);
      $.SUBRULE($.expression, { LABEL: "arguments", ARGS: [returnType] });
      $.MANY(() => {
        $.CONSUME2(Comma);
        $.SUBRULE2($.boolean, { LABEL: "arguments" });
        $.CONSUME3(Comma);
        $.SUBRULE3($.expression, { LABEL: "arguments", ARGS: [returnType] });
      });
      $.OPTION(() => {
        $.CONSUME4(Comma);
        $.SUBRULE4($.expression, { LABEL: "arguments", ARGS: [returnType] });
      });
      $.CONSUME(RParen);
    });

    $.RULE("metricExpression", () => {
      $.OR([
        { ALT: () => $.SUBRULE($.identifierString, { LABEL: "metricName" }) },
        { ALT: () => $.SUBRULE($.identifier, { LABEL: "metricName" }) },
      ]);
    });

    $.RULE("segmentExpression", () => {
      $.OR([
        { ALT: () => $.SUBRULE($.identifierString, { LABEL: "segmentName" }) },
        { ALT: () => $.SUBRULE($.identifier, { LABEL: "segmentName" }) },
      ]);
    });

    $.RULE("dimensionExpression", () => {
      $.OR([
        {
          ALT: () => $.SUBRULE($.identifierString, { LABEL: "dimensionName" }),
        },
        { ALT: () => $.SUBRULE($.identifier, { LABEL: "dimensionName" }) },
      ]);
    });

    $.RULE("identifier", () => {
      $.CONSUME(Identifier);
    });

    $.RULE("identifierString", () => {
      $.CONSUME(IdentifierString);
    });

    $.RULE("stringLiteral", () => {
      $.CONSUME(StringLiteral);
    });

    $.RULE("numberLiteral", () => {
      $.OPTION(() => $.CONSUME(Minus));
      $.CONSUME(NumberLiteral);
    });

    $.RULE("atomicExpression", returnType => {
      $.OR({
        DEF: [
          // functions: used by aggregations, expressions, and filters
          {
            GATE: () => {
              const fn = this._getFnFromToken(this.LA(1));
              return (
                fn &&
                // hmmm
                (isExpressionType(fn.type, returnType) ||
                  isExpressionType(returnType, fn.type))
              );
            },
            ALT: () =>
              $.SUBRULE($.functionExpression, {
                LABEL: "expression",
                ARGS: [returnType],
              }),
          },
          // aggregations
          {
            GATE: () => isExpressionType("aggregation", returnType),
            ALT: () =>
              $.SUBRULE($.metricExpression, {
                LABEL: "expression",
              }),
          },
          // filters
          {
            GATE: () => isExpressionType("boolean", returnType),
            ALT: () =>
              $.SUBRULE($.comparisonExpression, {
                LABEL: "expression",
              }),
          },
          {
            GATE: () => isExpressionType("boolean", returnType),
            ALT: () =>
              $.SUBRULE($.booleanUnaryExpression, {
                LABEL: "expression",
              }),
          },
          {
            GATE: () => isExpressionType("boolean", returnType),
            ALT: () =>
              $.SUBRULE($.segmentExpression, {
                LABEL: "expression",
              }),
          },
          // expressions
          {
            GATE: () =>
              isExpressionType("string", returnType) ||
              isExpressionType("number", returnType),
            ALT: () =>
              $.SUBRULE($.caseExpression, {
                LABEL: "expression",
                ARGS: [returnType],
              }),
          },
          {
            GATE: () =>
              isExpressionType("string", returnType) ||
              isExpressionType("number", returnType),
            ALT: () =>
              $.SUBRULE($.dimensionExpression, {
                LABEL: "expression",
              }),
          },
          // number and string literals
          {
            GATE: () => isExpressionType("string", returnType),
            ALT: () =>
              $.SUBRULE($.stringLiteral, {
                LABEL: "expression",
              }),
          },
          {
            GATE: () =>
              isExpressionType("number", returnType) ||
              isExpressionType("aggregation", returnType),
            ALT: () =>
              $.SUBRULE($.numberLiteral, {
                LABEL: "expression",
              }),
          },
          // grouping
          {
            ALT: () =>
              $.SUBRULE($.parenthesisExpression, {
                ARGS: [returnType],
                LABEL: "expression",
              }),
          },
        ],
        ERR_MSG: returnType,
      });
    });

    $.RULE("parenthesisExpression", returnType => {
      $.CONSUME(LParen);
      $.SUBRULE($.any, { LABEL: "expression", ARGS: [returnType] });
      $.CONSUME(RParen);
    });

    // FILTERS

    this.performSelfAnalysis();
  }

  _getFnFromToken(token) {
    if (this.RECORDING_PHASE) {
      // return a fake clause during recording phase
      return { name: null, type: null, args: [] };
    } else {
      return CLAUSE_TOKENS.get(token.tokenType);
    }
  }

  canTokenTypeBeInsertedInRecovery() {
    // console.log("insert", this.tokenRecoveryEnabled);
    return this.tokenRecoveryEnabled;
  }

  canRecoverWithSingleTokenDeletion() {
    // console.log("delete", this.tokenRecoveryEnabled);
    return this.tokenRecoveryEnabled;
  }
}

export const parser = new ExpressionParser();
export const parserWithRecovery = new ExpressionParser({
  recoveryEnabled: true,
});

export class ExpressionCstVisitor extends parser.getBaseCstVisitorConstructor() {}

export function parse({
  source,
  tokenVector,
  startRule = "expression",
  recover = false,
} = {}) {
  const l = recover ? lexerWithRecovery : lexer;
  const p = recover ? parserWithRecovery : parser;

  let lexerErrors;
  // Lex
  if (!tokenVector) {
    const { tokens, errors } = l.tokenize(source);
    lexerErrors = errors;
    for (const error of lexerErrors) {
      cleanErrorMessage(error);
    }
    if (lexerErrors.length > 0) {
      throw lexerErrors;
    } else {
      tokenVector = tokens;
    }
  }
  const lexerRecovered =
    tokenVector.length > 0 &&
    isTokenType(tokenVector[tokenVector.length - 1].tokenType, RecoveryToken);

  // Parse
  p.input = tokenVector;
  const cst = p[startRule]();
  const parserErrors = p.errors;
  for (const error of parserErrors) {
    cleanErrorMessage(error);
  }
  if (parserErrors.length > 0 && !recover) {
    throw parserErrors;
  }
  const parserRecovered = !!(cst && parserErrors.length > 0);

  return {
    cst,
    tokenVector,
    lexerRecovered,
    parserRecovered,
    parserErrors,
    lexerErrors,
  };
}

function cleanErrorMessage(error) {
  error.message =
    error.message &&
    error.message
      .replace(/^Expecting:?\s+/, "Expected ")
      .replace(/--> (.*?) <--/g, "$1")
      .replace(/(\n|\s)*but found:?/, " but found ")
      .replace(/\s*but found\s+''$/, "");
}
