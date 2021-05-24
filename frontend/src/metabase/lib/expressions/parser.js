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
  BooleanOperatorUnary,
  LogicalAndOperator,
  LogicalOrOperator,
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
import { typeCheck } from "./typechecker";

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
      $.SUBRULE($.booleanExpression, {
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
      $.SUBRULE($.booleanExpression, {
        LABEL: "expression",
        ARGS: ["aggregation"],
      });
    });

    // a filter expression
    $.RULE("boolean", returnType => {
      $.SUBRULE($.booleanExpression, {
        ARGS: [returnType],
        LABEL: "expression",
      });
    });

    // EXPRESSIONS:

    // Lowest precedence thus it is first in the rule chain
    // The precedence of binary expressions is determined by
    // how far down the Parse Tree the binary expression appears.
    $.RULE("booleanExpression", returnType => {
      $.SUBRULE($.logicalOrExpression, {
        ARGS: [returnType],
        LABEL: "expression",
      });
    });
    $.RULE("logicalOrExpression", returnType => {
      $.SUBRULE($.logicalAndExpression, {
        ARGS: [returnType],
        LABEL: "operands",
      });
      $.MANY(() => {
        $.CONSUME(LogicalOrOperator, { LABEL: "operators" });
        $.SUBRULE2($.logicalAndExpression, {
          ARGS: [returnType],
          LABEL: "operands",
        });
      });
    });
    $.RULE("logicalAndExpression", returnType => {
      $.SUBRULE($.booleanUnaryExpression, {
        ARGS: [returnType],
        LABEL: "operands",
      });
      $.MANY(() => {
        $.CONSUME(LogicalAndOperator, { LABEL: "operators" });
        $.SUBRULE2($.booleanUnaryExpression, {
          ARGS: [returnType],
          LABEL: "operands",
        });
      });
    });

    $.RULE("booleanUnaryExpression", returnType => {
      $.OR([
        {
          ALT: () =>
            $.SUBRULE($.logicalNotExpression, {
              ARGS: [returnType],
              LABEL: "expression",
            }),
        },
        {
          ALT: () =>
            $.SUBRULE($.relationalExpression, {
              ARGS: [returnType],
              LABEL: "expression",
            }),
        },
      ]);
    });
    $.RULE("logicalNotExpression", returnType => {
      $.CONSUME(BooleanOperatorUnary, { LABEL: "operators" });
      $.SUBRULE($.booleanUnaryExpression, {
        ARGS: [returnType],
        LABEL: "operands",
      });
    });

    $.RULE("relationalExpression", returnType => {
      $.SUBRULE($.additionExpression, {
        ARGS: [returnType],
        LABEL: "operands",
      });
      $.MANY(() => {
        $.CONSUME(FilterOperator, { LABEL: "operators" });
        $.SUBRULE2($.additionExpression, {
          ARGS: [returnType],
          LABEL: "operands",
        });
      });
    });
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
      $.SUBRULE($.expression, { LABEL: "arguments" });
      $.MANY(() => {
        $.CONSUME(Comma);
        $.SUBRULE1($.expression, { LABEL: "arguments", ARGS: [returnType] });
      });
      $.CONSUME(RParen);
    });

    $.RULE("identifierExpression", () => {
      $.OR([
        {
          ALT: () => $.SUBRULE($.identifierString, { LABEL: "identifierName" }),
        },
        { ALT: () => $.SUBRULE($.identifier, { LABEL: "identifierName" }) },
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
            GATE: () => this._getFnFromToken(this.LA(1)),
            ALT: () =>
              $.SUBRULE($.functionExpression, {
                LABEL: "expression",
                ARGS: [returnType],
              }),
          },
          // filters
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
          // number and string literals
          {
            ALT: () =>
              $.SUBRULE($.stringLiteral, {
                LABEL: "expression",
              }),
          },
          {
            ALT: () =>
              $.SUBRULE($.numberLiteral, {
                LABEL: "expression",
              }),
          },
          {
            // dimension/metric/segment
            ALT: () =>
              $.SUBRULE($.identifierExpression, {
                ARGS: [returnType],
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
      $.SUBRULE($.expression, { LABEL: "expression", ARGS: [returnType] });
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
  const { typeErrors } = typeCheck(cst, startRule || "expression");
  const parserRecovered = !!(cst && parserErrors.length > 0);

  return {
    cst,
    tokenVector,
    lexerRecovered,
    parserRecovered,
    parserErrors,
    lexerErrors,
    typeErrors,
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
