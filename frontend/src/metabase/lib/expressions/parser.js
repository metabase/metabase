const { Lexer, Parser, extendToken, getImage } = require("chevrotain");
const _ = require("underscore");

import { VALID_AGGREGATIONS } from "../expressions";

export const AGGREGATION_ARITY = new Map([
    ["Count", 0],
    ["CumulativeCount", 0],
    ["Sum", 1],
    ["CumulativeSum", 1],
    ["Distinct", 1],
    ["Average", 1],
    ["Min", 1],
    ["Max", 1]
]);

const AdditiveOperator = extendToken("AdditiveOperator", Lexer.NA);
const Plus = extendToken("Plus", /\+/, AdditiveOperator);
const Minus = extendToken("Minus", /-/, AdditiveOperator);

const MultiplicativeOperator = extendToken("MultiplicativeOperator", Lexer.NA);
const Multi = extendToken("Multi", /\*/, MultiplicativeOperator);
const Div = extendToken("Div", /\//, MultiplicativeOperator);

const Aggregation = extendToken("Aggregation", Lexer.NA);

const Keyword = extendToken('Keyword', Lexer.NA);

const Identifier = extendToken('Identifier', /\w+/);
var NumberLiteral = extendToken("NumberLiteral", /-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/);
var StringLiteral = extendToken("StringLiteral", /"(?:[^\\"]+|\\(?:[bfnrtv"\\/]|u[0-9a-fA-F]{4}))*"/);

const Comma = extendToken('Comma', /,/);
const LParen = extendToken('LParen', /\(/);
const RParen = extendToken('RParen', /\)/);

const WhiteSpace = extendToken("WhiteSpace", /\s+/);
WhiteSpace.GROUP = Lexer.SKIPPED;

const aggregationsTokens = Array.from(VALID_AGGREGATIONS).map(([short, expressionName]) =>
    extendToken(expressionName, new RegExp(expressionName), Aggregation)
);
const aggregationsMap = new Map(Array.from(VALID_AGGREGATIONS).map(([a,b]) => [b,a]));

// whitespace is normally very common so it is placed first to speed up the lexer
export const allTokens = [
    WhiteSpace, LParen, RParen, Comma,
    Plus, Minus, Multi, Div,
    AdditiveOperator, MultiplicativeOperator,
    StringLiteral, NumberLiteral,
    Aggregation, ...aggregationsTokens,
    Keyword, Identifier
];

const ExpressionsLexer = new Lexer(allTokens);


class ExpressionsParser extends Parser {
    constructor(input, fields) {
        super(input, allTokens, { recoveryEnabled: false });

        this._fields = fields || [];

        let $ = this;

        // an expression without aggregations in it
        $.RULE("expression", function (outsideAggregation = false) {
            return $.SUBRULE($.additionExpression, [outsideAggregation])
        });

        // an expression with aggregations in it
        $.RULE("aggregation", function () {
            return $.SUBRULE($.additionExpression, [true])
        });

        // Lowest precedence thus it is first in the rule chain
        // The precedence of binary expressions is determined by
        // how far down the Parse Tree the binary expression appears.
        $.RULE("additionExpression", (outsideAggregation) => {
            let value = $.SUBRULE($.multiplicationExpression, [outsideAggregation]);
            $.MANY(() => {
                const op = $.CONSUME(AdditiveOperator);
                const rhsVal = $.SUBRULE2($.multiplicationExpression, [outsideAggregation]);

                if (Array.isArray(value) && value[0] === op.image) {
                    value.push(rhsVal);
                } else {
                    value = [op.image, value, rhsVal]
                }
            });
            return value
        });

        $.RULE("multiplicationExpression", (outsideAggregation) => {
            let value = $.SUBRULE($.atomicExpression, [outsideAggregation]);
            $.MANY(() => {
                const op = $.CONSUME(MultiplicativeOperator);
                const rhsVal = $.SUBRULE2($.atomicExpression, [outsideAggregation]);

                if (Array.isArray(value) && value[0] === op.image) {
                    value.push(rhsVal);
                } else {
                    value = [op.image, value, rhsVal]
                }
            });
            return value
        });

        $.RULE("aggregationExpression", (outsideAggregation) => {
            const agg = $.CONSUME(Aggregation).image;
            let value = [aggregationsMap.get(agg)]
            $.CONSUME(LParen);
            $.OPTION(() => {
                // aggregations cannot be nested, so pass false to the expression subrule
                value.push($.SUBRULE($.expression, [false]));
                $.MANY(() => {
                    $.CONSUME(Comma);
                    value.push($.SUBRULE2($.expression, [false]));
                });
            });
            $.CONSUME(RParen);
            return value;
        });

        $.RULE("fieldExpression", () => {
            let fieldName = $.OR([
                {ALT: () => JSON.parse($.CONSUME(StringLiteral).image) },
                {ALT: () => $.CONSUME(Identifier).image }
            ]);
            return ["field-id", this.getFieldIdForName(fieldName)];
        });

        $.RULE("atomicExpression", (outsideAggregation) => {
            return $.OR([
                // aggregations not allowed inside other aggregations
                {GATE: () => outsideAggregation, ALT: () => $.SUBRULE($.aggregationExpression, [false]) },
                // fields not allowed outside aggregations
                {GATE: () => !outsideAggregation, ALT: () => $.SUBRULE($.fieldExpression) },
                {ALT: () => $.SUBRULE($.parenthesisExpression, [outsideAggregation]) },
                {ALT: () => parseFloat($.CONSUME(NumberLiteral).image) }
            ], "a number or field name");
        });

        $.RULE("parenthesisExpression", (outsideAggregation) => {
            let expValue;

            $.CONSUME(LParen);
            expValue = $.SUBRULE($.expression, [outsideAggregation]);
            $.CONSUME(RParen);

            return expValue
        });

        Parser.performSelfAnalysis(this);
    }

    getFieldIdForName(fieldName) {
      for (const field of this._fields) {
          if (field.display_name.toLowerCase() === fieldName.toLowerCase()) {
              return field.id;
          }
      }
      throw new Error("Unknown field \"" + fieldName + "\"");
    }
}

// No need for more than one instance.
const parserInstance = new ExpressionsParser([])

function getSubTokenTypes(TokenClass) {
    return TokenClass.extendingTokenTypes.map(tokenType => _.findWhere(allTokens, { tokenType }));
}

function getTokenSource(TokenClass) {
    // strip regex escaping, e.x. "\+" -> "+"
    return TokenClass.PATTERN.source.replace(/^\\/, "");
}

export function compile(source, { startRule, fields } = {}) {
    if (!source) {
        return [];
    }
    const parser = new ExpressionsParser(ExpressionsLexer.tokenize(source).tokens, fields);
    const expression = parser[startRule]();
    if (parser.errors.length > 0) {
        throw parser.errors;
    }
    return expression;
}

export function suggest(source, { startRule, index = source.length, fields } = {}) {
    const partialSource = source.slice(0, index);
    const lexResult = ExpressionsLexer.tokenize(partialSource);
    if (lexResult.errors.length > 0) {
        throw new Error("sad sad panda, lexing errors detected");
    }

    const lastInputToken = _.last(lexResult.tokens)
    let partialSuggestionMode = false
    let assistanceTokenVector = lexResult.tokens

    // we have requested assistance while inside a Keyword or Identifier
    if ((lastInputToken instanceof Identifier || lastInputToken instanceof Keyword) &&
        /\w/.test(partialSource[partialSource.length - 1])) {
        assistanceTokenVector = assistanceTokenVector.slice(0, -1);
        partialSuggestionMode = true
    }

    const syntacticSuggestions = parserInstance.computeContentAssist(startRule, assistanceTokenVector)

    let finalSuggestions = []

    for (const suggestion of syntacticSuggestions) {
        const { nextTokenType, ruleStack } = suggestion;
        // no nesting of aggregations or field references outside of aggregations
        // we have a predicate in the grammar to prevent nested aggregations but chevrotain
        // doesn't support predicates in content-assist mode, so we need this extra check
        const outsideAggregation = startRule === "aggregation" && ruleStack.slice(0, -1).indexOf("aggregationExpression") < 0;

        if (nextTokenType === MultiplicativeOperator || nextTokenType === AdditiveOperator) {
            let tokens = getSubTokenTypes(nextTokenType);
            finalSuggestions.push(...tokens.map(token => ({
                type: "operators",
                name: getTokenSource(token),
                text: " " + getTokenSource(token) + " ",
                prefixTrim: /\s+$/,
                postfixTrim: /^\s+/
            })))
        } else if (nextTokenType === LParen) {
            finalSuggestions.push({
                type: "other",
                name: "(",
                text: " (",
                postfixText: ")",
                prefixTrim: /\s+$/,
                postfixTrim: /^\s+/
            });
        } else if (nextTokenType === RParen) {
            finalSuggestions.push({
                type: "other",
                name: ")",
                text: ") ",
                prefixTrim: /\s+$/,
                postfixTrim: /^\s+/
            });
        } else if (nextTokenType === Identifier || nextTokenType === StringLiteral) {
            if (!outsideAggregation) {
                finalSuggestions.push(...fields.map(field => ({
                    type: "fields",
                    name: field.display_name,
                    text: /^\w+$/.test(field.display_name) ?
                        field.display_name + " " : // need a space to terminate identifier
                        JSON.stringify(field.display_name),
                    prefixTrim: /\w+$/,
                    postfixTrim: /^\w+\s*/
                })))
            }
        } else if (nextTokenType === Aggregation) {
            if (outsideAggregation) {
                let tokens = getSubTokenTypes(nextTokenType);
                finalSuggestions.push(...tokens.map(token => {
                    let text = getTokenSource(token);
                    let arity = AGGREGATION_ARITY.get(text);
                    return {
                        type: "aggregations",
                        name: text,
                        text: text + "(" + (arity > 0 ? "" : ")"),
                        postfixText: arity > 0 ? ")" : "",
                        prefixTrim: /\w+$/,
                        postfixTrim: /^\w+\(\)?/
                    }
                }));
            }
        } else if (nextTokenType === NumberLiteral) {
            // skip number literal
        } else {
            console.warn("non exhaustive match", suggestion)
        }
    }

    // throw away any suggestion that is not a suffix of the last partialToken.
    if (partialSuggestionMode) {
        const partial = getImage(lastInputToken).toLowerCase();
        finalSuggestions = _.filter(finalSuggestions, (suggestion) =>
            (suggestion.text && suggestion.text.toLowerCase().startsWith(partial)) ||
            (suggestion.name && suggestion.name.toLowerCase().startsWith(partial))
        );

        let prefixLength = partial.length;
        for (const suggestion of finalSuggestions) {
            suggestion.prefixLength = prefixLength;
        }
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
