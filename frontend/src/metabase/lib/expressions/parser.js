import { CstParser } from "chevrotain";

import _ from "underscore";

import {
  ExpressionLexer,
  allTokens,
  LParen,
  RParen,
  AdditiveOperator,
  MultiplicativeOperator,
  NullaryAggregation,
  UnaryAggregation,
  StringLiteral,
  NumberLiteral,
  Minus,
  Identifier,
} from "./lexer";

class ExpressionPure extends CstParser {
  constructor() {
    super(allTokens);

    const $ = this;

    // an expression without aggregations in it
    $.RULE("expression", (outsideAggregation = false) => {
      $.SUBRULE($.additionExpression, { ARGS: [outsideAggregation] });
    });

    // an expression with aggregations in it
    $.RULE("aggregation", () => {
      $.SUBRULE($.additionExpression, { ARGS: [true] });
    });

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

    $.RULE("nullaryCall", () => {
      $.CONSUME(LParen);
      $.CONSUME(RParen);
    });
    $.RULE("unaryCall", () => {
      $.CONSUME(LParen);
      $.SUBRULE($.expression, { ARGS: [false] });
      $.CONSUME(RParen);
    });

    $.RULE("aggregationExpression", outsideAggregation => {
      $.OR([
        {
          ALT: () => {
            $.CONSUME(NullaryAggregation, { LABEL: "aggregation" });
            $.OPTION(() => $.SUBRULE($.nullaryCall, { LABEL: "call" }));
          },
        },
        {
          ALT: () => {
            $.CONSUME(UnaryAggregation, { LABEL: "aggregation" });
            $.SUBRULE($.unaryCall, { LABEL: "call" });
          },
        },
      ]);
    });

    $.RULE("metricExpression", () => {
      $.OR([
        { ALT: () => $.SUBRULE($.stringLiteral, { LABEL: "metricName" }) },
        { ALT: () => $.SUBRULE($.identifier, { LABEL: "metricName" }) },
      ]);
    });

    $.RULE("dimensionExpression", () => {
      $.OR([
        { ALT: () => $.SUBRULE($.stringLiteral, { LABEL: "dimensionName" }) },
        { ALT: () => $.SUBRULE($.identifier, { LABEL: "dimensionName" }) },
      ]);
    });

    $.RULE("identifier", () => {
      $.CONSUME(Identifier);
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

    this.performSelfAnalysis();
  }
}

export const parser = new ExpressionPure();
export const ExpressionCstVisitor = parser.getBaseCstVisitorConstructor();

export function parse(source, options, Vistor = null) {
  const { startRule } = options || {};
  parser.input = ExpressionLexer.tokenize(source).tokens;
  const cst = parser[startRule]();

  if (parser.errors.length > 0) {
    for (const error of parser.errors) {
      // clean up error messages
      error.message =
        error.message &&
        error.message
          .replace(/^Expecting:?\s+/, "Expected ")
          .replace(/--> (.*?) <--/g, "$1")
          .replace(/(\n|\s)*but found:?/, " but found ")
          .replace(/\s*but found\s+''$/, "");
    }
    throw parser.errors;
  }

  return cst;
}
