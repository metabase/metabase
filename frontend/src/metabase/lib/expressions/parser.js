import { Lexer, CstParser } from "chevrotain";

import _ from "underscore";
import { t } from "ttag";
import {
  // aggregations:
  formatAggregationName,
  getAggregationFromName,
  // dimensions:
  getDimensionFromName,
  getDimensionName,
  formatDimensionName,
} from "../expressions";

import {
  allTokens,
  LParen,
  RParen,
  AdditiveOperator,
  MultiplicativeOperator,
  Aggregation,
  NullaryAggregation,
  UnaryAggregation,
  StringLiteral,
  NumberLiteral,
  Minus,
  Identifier,
} from "./tokens";

import { ExpressionDimension } from "metabase-lib/lib/Dimension";

const ExpressionsLexer = new Lexer(allTokens);

function getImage(token) {
  return token.image;
}

function isTokenType(tokenType, name) {
  return (
    tokenType &&
    (tokenType.name === name ||
      _.any(tokenType.CATEGORIES, c => isTokenType(c, name)))
  );
}

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

const parser = new ExpressionPure();

const BaseCstVisitor = parser.getBaseCstVisitorConstructor();
class ExpressionMBQLCompiler extends BaseCstVisitor {
  constructor(options) {
    super();
    this._options = options;
    this.validateVisitor();
  }

  expression(ctx) {
    return this.visit(ctx.additionExpression);
  }
  aggregation(ctx) {
    return this.visit(ctx.additionExpression);
  }

  additionExpression(ctx) {
    return this._arithmeticExpression(ctx);
  }
  multiplicationExpression(ctx) {
    return this._arithmeticExpression(ctx);
  }
  _arithmeticExpression(ctx) {
    let initial = this.visit(ctx.lhs);
    if (ctx.rhs) {
      for (const index of ctx.rhs.keys()) {
        const operator = ctx.operator[index].image;
        const operand = this.visit(ctx.rhs[index]);
        // collapse multiple consecutive operators into a single MBQL statement
        if (Array.isArray(initial) && initial[0] === operator) {
          initial.push(operand);
        } else {
          initial = [operator, initial, operand];
        }
      }
    }
    return initial;
  }

  aggregationExpression(ctx) {
    const agg = this._getAggregationForName(ctx.aggregation[0].image);
    const args = ctx.call ? this.visit(ctx.call) : [];
    return [agg, ...args];
  }
  nullaryCall(ctx) {
    return [];
  }
  unaryCall(ctx) {
    return [this.visit(ctx.expression)];
  }

  metricExpression(ctx) {
    const metricName = this.visit(ctx.metricName);
    const metric = this._getMetricForName(metricName);
    if (!metric) {
      throw new Error(`Unknown Metric: ${metricName}`);
    }
    return ["metric", metric.id];
  }
  dimensionExpression(ctx) {
    const dimensionName = this.visit(ctx.dimensionName);
    const dimension = this._getDimensionForName(dimensionName);
    if (!dimension) {
      throw new Error(`Unknown Field: ${dimensionName}`);
    }
    return dimension.mbql();
  }

  identifier(ctx) {
    return ctx.Identifier[0].image;
  }
  stringLiteral(ctx) {
    return JSON.parse(ctx.StringLiteral[0].image);
  }
  numberLiteral(ctx) {
    return parseFloat(ctx.NumberLiteral[0].image) * (ctx.Minus ? -1 : 1);
  }
  atomicExpression(ctx) {
    return this.visit(ctx.expression);
  }
  parenthesisExpression(ctx) {
    return this.visit(ctx.expression);
  }

  _getDimensionForName(dimensionName) {
    return getDimensionFromName(dimensionName, this._options.query);
  }
  _getMetricForName(metricName) {
    return this._options.query
      .table()
      .metrics.find(
        metric => metric.name.toLowerCase() === metricName.toLowerCase(),
      );
  }
  _getAggregationForName(aggregationName) {
    return getAggregationFromName(aggregationName);
  }
}

//class ExpressionMBQLCompiler extends BaseCstVisitor {
// }

// const syntax = (type, ...children) => ({
//   type: type,
//   children: children.filter(child => child),
// });
// const token = token =>
//   token && {
//     type: "token",
//     text: token.image,
//     start: token.startOffset,
//     end: token.endOffset,
//   };

// class ExpressionsParserSyntax extends ExpressionsParser {
//   _math(initial, operations) {
//     return syntax(
//       "math",
//       ...[initial].concat(...operations.map(([op, arg]) => [token(op), arg])),
//     );
//   }
//   _aggregation(aggregation, lParen, arg, rParen) {
//     return syntax(
//       "aggregation",
//       token(aggregation),
//       token(lParen),
//       arg,
//       token(rParen),
//     );
//   }
//   _metricReference(metricName, metricId) {
//     return syntax("metric", metricName);
//   }
//   _dimensionReference(dimensionName, dimension) {
//     return syntax("field", dimensionName);
//   }
//   _unknownField(fieldName) {
//     return syntax("unknown", fieldName);
//   }
//   _unknownMetric(metricName) {
//     return syntax("unknown", metricName);
//   }

//   _identifier(identifier) {
//     return syntax("identifier", token(identifier));
//   }
//   _stringLiteral(stringLiteral) {
//     return syntax("string", token(stringLiteral));
//   }
//   _numberLiteral(minus, numberLiteral) {
//     return syntax("number", token(minus), token(numberLiteral));
//   }
//   _parens(lParen, expValue, rParen) {
//     return syntax("group", token(lParen), expValue, token(rParen));
//   }
//   _toString(x) {
//     if (typeof x === "string") {
//       return x;
//     } else if (x.type === "string") {
//       return JSON.parse(x.children[0].text);
//     } else if (x.type === "identifier") {
//       return x.children[0].text;
//     }
//   }
// }

function getSubTokenTypes(TokenClass) {
  return TokenClass.extendingTokenTypes.map(tokenType =>
    _.findWhere(allTokens, { tokenType }),
  );
}

function getTokenSource(TokenClass) {
  // strip regex escaping, e.x. "\+" -> "+"
  return TokenClass.PATTERN.source.replace(/^\\/, "");
}

function run(Visitor, source, options) {
  const { startRule } = options || {};
  if (!source) {
    return [];
  }
  const visitor = new Visitor(options);
  parser.input = ExpressionsLexer.tokenize(source).tokens;
  const cst = parser[startRule]();
  const expression = visitor.visit(cst);

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
  return expression;
}

export function compile(source, options) {
  return run(ExpressionMBQLCompiler, source, options);
}

export function parse(source, options) {
  return run(ExpressionsParserSyntax, source, options);
}

export function suggest(
  source,
  { query, startRule, index = source.length, expressionName } = {},
) {
  const partialSource = source.slice(0, index);
  const lexResult = ExpressionsLexer.tokenize(partialSource);
  if (lexResult.errors.length > 0) {
    throw new Error(t`sad sad panda, lexing errors detected`);
  }

  const lastInputToken = _.last(lexResult.tokens);
  let partialSuggestionMode = false;
  let assistanceTokenVector = lexResult.tokens;

  // we have requested assistance while inside an Identifier
  if (
    lastInputToken &&
    isTokenType(lastInputToken.tokenType, "Identifier") &&
    /\w/.test(partialSource[partialSource.length - 1])
  ) {
    assistanceTokenVector = assistanceTokenVector.slice(0, -1);
    partialSuggestionMode = true;
  }

  let finalSuggestions = [];

  // TODO: is there a better way to figure out which aggregation we're inside of?
  const currentAggregationToken = _.find(
    assistanceTokenVector.slice().reverse(),
    t => t && isTokenType(t.tokenType, "Aggregation"),
  );

  const syntacticSuggestions = parser.computeContentAssist(
    startRule,
    assistanceTokenVector,
  );
  for (const suggestion of syntacticSuggestions) {
    const { nextTokenType, ruleStack } = suggestion;
    // no nesting of aggregations or field references outside of aggregations
    // we have a predicate in the grammar to prevent nested aggregations but chevrotain
    // doesn't support predicates in content-assist mode, so we need this extra check
    const outsideAggregation =
      startRule === "aggregation" &&
      ruleStack.slice(0, -1).indexOf("aggregationExpression") < 0;

    if (
      nextTokenType === MultiplicativeOperator ||
      nextTokenType === AdditiveOperator
    ) {
      const tokens = getSubTokenTypes(nextTokenType);
      finalSuggestions.push(
        ...tokens.map(token => ({
          type: "operators",
          name: getTokenSource(token),
          text: " " + getTokenSource(token) + " ",
          prefixTrim: /\s*$/,
          postfixTrim: /^\s*[*/+-]?\s*/,
        })),
      );
    } else if (nextTokenType === LParen) {
      finalSuggestions.push({
        type: "other",
        name: "(",
        text: " (",
        postfixText: ")",
        prefixTrim: /\s*$/,
        postfixTrim: /^\s*\(?\s*/,
      });
    } else if (nextTokenType === RParen) {
      finalSuggestions.push({
        type: "other",
        name: ")",
        text: ") ",
        prefixTrim: /\s*$/,
        postfixTrim: /^\s*\)?\s*/,
      });
    } else if (
      nextTokenType === Identifier ||
      nextTokenType === StringLiteral
    ) {
      if (!outsideAggregation) {
        let dimensions = [];
        if (startRule === "aggregation" && currentAggregationToken) {
          const aggregationShort = getAggregationFromName(
            getImage(currentAggregationToken),
          );
          dimensions = query.aggregationFieldOptions(aggregationShort).all();
        } else if (startRule === "expression") {
          dimensions = query
            .dimensionOptions(
              d =>
                // numeric
                d.field().isNumeric() &&
                // not itself
                !(
                  d instanceof ExpressionDimension &&
                  d.name() === expressionName
                ),
            )
            .all();
        }
        finalSuggestions.push(
          ...dimensions.map(dimension => ({
            type: "fields",
            name: getDimensionName(dimension),
            text: formatDimensionName(dimension) + " ",
            prefixTrim: /\w+$/,
            postfixTrim: /^\w+\s*/,
          })),
        );
      }
    } else if (
      nextTokenType === Aggregation ||
      nextTokenType === NullaryAggregation ||
      nextTokenType === UnaryAggregation ||
      nextTokenType === Identifier ||
      nextTokenType === StringLiteral
    ) {
      if (outsideAggregation) {
        finalSuggestions.push(
          ...query
            .aggregationOperatorsWithoutRows()
            .filter(a => formatAggregationName(a))
            .map(aggregationOperator => {
              const arity = aggregationOperator.fields.length;
              return {
                type: "aggregations",
                name: formatAggregationName(aggregationOperator),
                text:
                  formatAggregationName(aggregationOperator) +
                  (arity > 0 ? "(" : " "),
                postfixText: arity > 0 ? ")" : " ",
                prefixTrim: /\w+$/,
                postfixTrim: arity > 0 ? /^\w+(\(\)?|$)/ : /^\w+\s*/,
              };
            }),
        );
        // NOTE: DISABLE METRICS
        // finalSuggestions.push(...tableMetadata.metrics.map(metric => ({
        //     type: "metrics",
        //     name: metric.name,
        //     text: formatMetricName(metric),
        //     prefixTrim: /\w+$/,
        //     postfixTrim: /^\w+\s*/
        // })))
      }
    } else if (nextTokenType === NumberLiteral) {
      // skip number literal
    } else {
      console.warn("non exhaustive match", nextTokenType.name, suggestion);
    }
  }

  // throw away any suggestion that is not a suffix of the last partialToken.
  if (partialSuggestionMode) {
    const partial = getImage(lastInputToken).toLowerCase();
    for (const suggestion of finalSuggestions) {
      suggestion: for (const text of [suggestion.name, suggestion.text]) {
        let index = 0;
        for (const part of (text || "").toLowerCase().split(/\b/g)) {
          if (part.startsWith(partial)) {
            suggestion.range = [index, index + partial.length];
            break suggestion;
          }
          index += part.length;
        }
      }
    }
    finalSuggestions = finalSuggestions.filter(suggestion => suggestion.range);
  }
  for (const suggestion of finalSuggestions) {
    suggestion.index = index;
    if (!suggestion.name) {
      suggestion.name = suggestion.text;
    }
  }

  // deduplicate suggestions and sort by type then name
  return _.chain(finalSuggestions)
    .uniq(suggestion => suggestion.text)
    .sortBy("name")
    .sortBy("type")
    .value();
}
