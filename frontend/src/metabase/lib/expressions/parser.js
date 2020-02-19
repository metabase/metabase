import { CstParser } from "chevrotain";

import _ from "underscore";

import {
  lexer,
  allTokens,
  LParen,
  RParen,
  AdditiveOperator,
  MultiplicativeOperator,
  FunctionName,
  Case,
  FilterName,
  FilterOperator,
  BooleanFilterOperator,
  StringLiteral,
  NumberLiteral,
  Minus,
  Identifier,
  IdentifierString,
  Comma,
  aggregationArgsTokens,
  getArgsForToken,
} from "./lexer";

export class ExpressionParser extends CstParser {
  constructor(config = {}) {
    super(allTokens, config);

    const $ = this;

    // START RULES:

    // an expression without aggregations in it
    $.RULE("expression", (outsideAggregation = false) => {
      $.SUBRULE($.additionExpression, { ARGS: [outsideAggregation] });
    });

    // an expression with aggregations in it
    $.RULE("aggregation", () => {
      $.SUBRULE($.additionExpression, { ARGS: [true] });
    });

    // a filter expression
    $.RULE("filter", () => {
      $.SUBRULE($.filterBooleanExpression);
    });

    // EXPRESSIONS:

    // Lowest precedence thus it is first in the rule chain
    // The precedence of binary expressions is determined by
    // how far down the Parse Tree the binary expression appears.
    $.RULE("additionExpression", outsideAggregation => {
      $.SUBRULE($.multiplicationExpression, {
        ARGS: [outsideAggregation],
        LABEL: "lhs",
      });
      $.MANY(() => {
        $.CONSUME(AdditiveOperator, { LABEL: "operator" });
        $.SUBRULE2($.multiplicationExpression, {
          ARGS: [outsideAggregation],
          LABEL: "rhs",
        });
      });
    });

    $.RULE("multiplicationExpression", outsideAggregation => {
      $.SUBRULE($.atomicExpression, {
        ARGS: [outsideAggregation],
        LABEL: "lhs",
      });
      $.MANY(() => {
        $.CONSUME(MultiplicativeOperator, { LABEL: "operator" });
        $.SUBRULE2($.atomicExpression, {
          ARGS: [outsideAggregation],
          LABEL: "rhs",
        });
      });
    });

    $.RULE("arg", (outsideAggregation, type = "expression") => {
      $.OR([
        {
          GATE: () => type === "expression",
          ALT: () => {
            $.SUBRULE($.expression, {
              LABEL: "argument",
              ARGS: [outsideAggregation],
            });
          },
        },
        {
          GATE: () => type === "filter",
          ALT: () => {
            $.SUBRULE($.filter, {
              LABEL: "argument",
              ARGS: [outsideAggregation],
            });
          },
        },
      ]);
    });

    $.RULE("call", (outsideAggregation, args) => {
      $.OR([
        {
          GATE: () => !args || args.length > 2,
          ALT: () => {
            $.CONSUME5(LParen);
            $.SUBRULE5($.arg, {
              LABEL: "arguments",
              ARGS: [outsideAggregation, "expression"],
            });
            $.MANY(() => {
              $.CONSUME5(Comma);
              $.SUBRULE6($.arg, {
                LABEL: "arguments",
                ARGS: [outsideAggregation, "expression"],
              });
            });
            $.CONSUME5(RParen);
          },
        },
        {
          GATE: () => args && args.length === 0,
          ALT: () => {
            $.CONSUME(LParen);
            $.CONSUME(RParen);
          },
        },
        {
          GATE: () => args && args.length === 1,
          ALT: () => {
            $.CONSUME2(LParen);
            $.SUBRULE2($.arg, {
              LABEL: "arguments",
              ARGS: [outsideAggregation, args && args[0]],
            });
            $.CONSUME2(RParen);
          },
        },
        {
          GATE: () => args && args.length === 2,
          ALT: () => {
            $.CONSUME3(LParen);
            $.SUBRULE3($.arg, {
              LABEL: "arguments",
              ARGS: [outsideAggregation, args && args[0]],
            });
            $.CONSUME3(Comma);
            $.SUBRULE4($.arg, {
              LABEL: "arguments",
              ARGS: [outsideAggregation, args && args[1]],
            });
            $.CONSUME3(RParen);
          },
        },
      ]);
    });

    $.RULE("aggregationExpression", () => {
      // creates alternatives for each permutation of arguments
      $.OR(
        Object.values(aggregationArgsTokens).map((token, index) => ({
          ALT: () => {
            $.CONSUME(token, { LABEL: "aggregationName" });
            const SUBRULE = `SUBRULE${index === 0 ? "" : index + 1}`;
            const args = getArgsForToken(token);
            if (args && args.length === 0) {
              $.OPTION(() => {
                $[SUBRULE]($.call, { LABEL: "call", ARGS: [false, args] });
              });
            } else {
              $[SUBRULE]($.call, { LABEL: "call", ARGS: [false, args] });
            }
          },
        })),
      );
    });

    $.RULE("functionExpression", outsideAggregation => {
      $.CONSUME(FunctionName, { LABEL: "functionName" });
      $.SUBRULE($.call, { LABEL: "call", ARGS: [outsideAggregation] });
    });

    $.RULE("caseExpression", () => {
      $.CONSUME(Case);
      $.CONSUME(LParen);
      $.SUBRULE($.filter);
      $.CONSUME(Comma);
      $.SUBRULE($.expression);
      $.MANY(() => {
        $.CONSUME2(Comma);
        $.SUBRULE2($.filter);
        $.CONSUME3(Comma);
        $.SUBRULE3($.expression);
      });
      $.OPTION(() => {
        $.CONSUME4(Comma);
        $.SUBRULE4($.expression, { LABEL: "default" });
      });
      $.CONSUME(RParen);
    });

    $.RULE("metricExpression", () => {
      $.OR([
        { ALT: () => $.SUBRULE($.identifierString, { LABEL: "metricName" }) },
        { ALT: () => $.SUBRULE($.identifier, { LABEL: "metricName" }) },
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

    $.RULE("atomicExpression", outsideAggregation => {
      $.OR({
        DEF: [
          // aggregations are not allowed inside other aggregations
          {
            GATE: () => outsideAggregation,
            ALT: () =>
              $.SUBRULE($.aggregationExpression, {
                ARGS: [false],
                LABEL: "expression",
              }),
          },
          // metrics are not allowed inside other aggregations
          // NOTE: DISABLE METRICS
          // {
          //   GATE: () => outsideAggregation,
          //   ALT: () => $.SUBRULE($.metricExpression, { LABEL: "expression" }),
          // },
          {
            // in theory numeric functions could be used in aggregations, but we don't have any currently?
            GATE: () => !outsideAggregation,
            ALT: () =>
              $.SUBRULE($.functionExpression, {
                ARGS: [outsideAggregation],
                LABEL: "expression",
              }),
          },
          {
            GATE: () => !outsideAggregation,
            ALT: () =>
              $.SUBRULE($.caseExpression, {
                LABEL: "expression",
              }),
          },
          // dimensions are not allowed outside aggregations
          {
            GATE: () => !outsideAggregation,
            ALT: () =>
              $.SUBRULE($.dimensionExpression, {
                LABEL: "expression",
              }),
          },
          {
            ALT: () =>
              $.SUBRULE($.parenthesisExpression, {
                ARGS: [outsideAggregation],
                LABEL: "expression",
              }),
          },
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
        ],
        ERR_MSG: outsideAggregation
          ? "aggregation, number, or expression"
          : "field name, number, or expression",
      });
    });

    $.RULE("parenthesisExpression", outsideAggregation => {
      $.CONSUME(LParen);
      $.SUBRULE($.expression, { ARGS: [outsideAggregation] });
      $.CONSUME(RParen);
    });

    // FILTERS

    $.RULE("filterBooleanExpression", () => {
      $.SUBRULE($.filterAtomicExpression, {
        LABEL: "lhs",
      });
      $.MANY(() => {
        $.CONSUME(BooleanFilterOperator, { LABEL: "operator" });
        $.SUBRULE2($.filterAtomicExpression, {
          LABEL: "rhs",
        });
      });
    });

    $.RULE("filterFunctionExpression", () => {
      $.CONSUME(FilterName, { LABEL: "functionName" });
      $.SUBRULE($.call, { LABEL: "call" });
    });

    $.RULE("filterOperatorExpression", () => {
      $.SUBRULE($.dimensionExpression, {
        LABEL: "lhs",
      });
      $.CONSUME(FilterOperator, { LABEL: "operator" });
      $.SUBRULE($.expression, {
        LABEL: "rhs",
      });
    });

    $.RULE("filterAtomicExpression", () => {
      $.OR({
        DEF: [
          {
            ALT: () =>
              $.SUBRULE($.filterOperatorExpression, {
                LABEL: "filter",
              }),
          },
          {
            ALT: () =>
              $.SUBRULE($.filterFunctionExpression, {
                LABEL: "filter",
              }),
          },
          {
            ALT: () =>
              $.SUBRULE($.filterParenthesisExpression, {
                LABEL: "filter",
              }),
          },
        ],
      });
    });

    $.RULE("filterParenthesisExpression", () => {
      $.CONSUME(LParen);
      $.SUBRULE($.filter);
      $.CONSUME(RParen);
    });

    this.performSelfAnalysis();
  }

  canTokenTypeBeInsertedInRecovery(tokType) {
    // console.log("canTokenTypeBeInsertedInRecovery", tokType);
    switch (tokType) {
      case RParen:
      case LParen:
        return true;
      default:
        return false;
    }
  }

  getTokenToInsert(tokType) {
    // console.log("getTokenToInsert", tokType);
    switch (tokType) {
      case RParen:
        return { image: ")" };
      case LParen:
        return { image: "(" };
    }
  }
}

export const parser = new ExpressionParser();
export const parserWithRecovery = new ExpressionParser({
  recoveryEnabled: true,
});

export const ExpressionCstVisitor = parser.getBaseCstVisitorConstructor();

export function parse(
  source,
  { startRule = "expression", recover = false } = {},
) {
  // Lex
  const { tokens, errors } = lexer.tokenize(source);
  if (errors.length > 0) {
    throw errors;
  }

  // Parse
  const p = recover ? parserWithRecovery : parser;
  p.input = tokens;
  const cst = p[startRule]();

  if (p.errors.length > 0) {
    for (const error of p.errors) {
      // clean up error messages
      error.message =
        error.message &&
        error.message
          .replace(/^Expecting:?\s+/, "Expected ")
          .replace(/--> (.*?) <--/g, "$1")
          .replace(/(\n|\s)*but found:?/, " but found ")
          .replace(/\s*but found\s+''$/, "");
    }
    throw p.errors;
  }

  return cst;
}
