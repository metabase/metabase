const { Lexer, Parser, extendToken, getImage } = require("chevrotain");
const _ = require("underscore");

import { VALID_AGGREGATIONS, formatFieldName, formatMetricName, formatExpressionName, formatAggregationName } from "../expressions";

const AdditiveOperator = extendToken("AdditiveOperator", Lexer.NA);
const Plus = extendToken("Plus", /\+/, AdditiveOperator);
const Minus = extendToken("Minus", /-/, AdditiveOperator);

const MultiplicativeOperator = extendToken("MultiplicativeOperator", Lexer.NA);
const Multi = extendToken("Multi", /\*/, MultiplicativeOperator);
const Div = extendToken("Div", /\//, MultiplicativeOperator);

const Aggregation = extendToken("Aggregation", Lexer.NA);
const aggregationsTokens = Array.from(VALID_AGGREGATIONS).map(([short, expressionName]) =>
    extendToken(expressionName, new RegExp(expressionName), Aggregation)
);

const Identifier = extendToken('Identifier', /\w+/);
var NumberLiteral = extendToken("NumberLiteral", /-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/);
var StringLiteral = extendToken("StringLiteral", /"(?:[^\\"]+|\\(?:[bfnrtv"\\/]|u[0-9a-fA-F]{4}))*"/);

const Comma = extendToken('Comma', /,/);
const LParen = extendToken('LParen', /\(/);
const RParen = extendToken('RParen', /\)/);

const WhiteSpace = extendToken("WhiteSpace", /\s+/);
WhiteSpace.GROUP = Lexer.SKIPPED;

const aggregationsMap = new Map(Array.from(VALID_AGGREGATIONS).map(([a,b]) => [b,a]));

// whitespace is normally very common so it is placed first to speed up the lexer
export const allTokens = [
    WhiteSpace, LParen, RParen, Comma,
    Plus, Minus, Multi, Div,
    AdditiveOperator, MultiplicativeOperator,
    Aggregation, ...aggregationsTokens,
    StringLiteral, NumberLiteral,
    Identifier
];

const ExpressionsLexer = new Lexer(allTokens);


class ExpressionsParser extends Parser {
    constructor(input, options) {
        super(input, allTokens, { recoveryEnabled: false });

        this._options = options;

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

        $.RULE("aggregationOrMetricExpression", (outsideAggregation) => {
            return $.OR([
                {ALT: () => $.SUBRULE($.aggregationExpression, [outsideAggregation]) },
                {ALT: () => $.SUBRULE($.metricExpression) }
            ]);
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

        $.RULE("metricExpression", () => {
            let metricName = $.CONSUME(Identifier).image;
            $.CONSUME(LParen);
            $.CONSUME(RParen);
            const metric = this.getMetricForName(metricName);
            if (metric != null) {
                return ["METRIC", metric.id];
            }
            throw new Error("Unknown metric \"" + metricName + "\"");
        });

        $.RULE("fieldExpression", () => {
            let fieldName = $.OR([
                {ALT: () => JSON.parse($.CONSUME(StringLiteral).image) },
                {ALT: () => $.CONSUME(Identifier).image }
            ]);
            const field = this.getFieldForName(fieldName);
            if (field != null) {
                return ["field-id", field.id];
            }
            const expression = this.getExpressionForName(fieldName);
            if (expression != null) {
                return ["expression", fieldName];
            }
            throw new Error("Unknown field \"" + fieldName + "\"");
        });

        $.RULE("atomicExpression", (outsideAggregation) => {
            return $.OR([
                // aggregations not allowed inside other aggregations
                {GATE: () => outsideAggregation, ALT: () => $.SUBRULE($.aggregationOrMetricExpression, [false]) },
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

    getFieldForName(fieldName) {
        const fields = this._options.tableMetadata && this._options.tableMetadata.fields;
        return _.findWhere(fields, { display_name: fieldName });
    }

    getExpressionForName(expressionName) {
        const customFields = this._options && this._options.customFields;
        return customFields[expressionName];
    }

    getMetricForName(metricName) {
        const metrics = this._options.tableMetadata && this._options.tableMetadata.metrics;
        return _.find(metrics, (metric) => formatMetricName(metric) === metricName);
    }
}

function getSubTokenTypes(TokenClass) {
    return TokenClass.extendingTokenTypes.map(tokenType => _.findWhere(allTokens, { tokenType }));
}

function getTokenSource(TokenClass) {
    // strip regex escaping, e.x. "\+" -> "+"
    return TokenClass.PATTERN.source.replace(/^\\/, "");
}

export function compile(source, options = {}) {
    if (!source) {
        return [];
    }
    const { startRule } = options;
    const parser = new ExpressionsParser(ExpressionsLexer.tokenize(source).tokens, options);
    const expression = parser[startRule]();
    if (parser.errors.length > 0) {
        throw parser.errors;
    }
    return expression;
}

// No need for more than one instance.
const parserInstance = new ExpressionsParser([])
export function suggest(source, {
    tableMetadata,
    customFields,
    startRule,
    index = source.length
} = {}) {
    const partialSource = source.slice(0, index);
    const lexResult = ExpressionsLexer.tokenize(partialSource);
    if (lexResult.errors.length > 0) {
        throw new Error("sad sad panda, lexing errors detected");
    }

    const lastInputToken = _.last(lexResult.tokens)
    let partialSuggestionMode = false
    let assistanceTokenVector = lexResult.tokens

    // we have requested assistance while inside an Identifier
    if ((lastInputToken instanceof Identifier) &&
        /\w/.test(partialSource[partialSource.length - 1])) {
        assistanceTokenVector = assistanceTokenVector.slice(0, -1);
        partialSuggestionMode = true
    }

    const syntacticSuggestions = parserInstance.computeContentAssist(startRule, assistanceTokenVector)

    let finalSuggestions = []

    // TODO: is there a better way to figure out which aggregation we're inside of?
    const currentAggregationToken = _.find(assistanceTokenVector.slice().reverse(), (t) => t instanceof Aggregation);

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
                prefixTrim: /\s*$/,
                postfixTrim: /^\s*[*/+-]?\s*/
            })))
        } else if (nextTokenType === LParen) {
            finalSuggestions.push({
                type: "other",
                name: "(",
                text: " (",
                postfixText: ")",
                prefixTrim: /\s*$/,
                postfixTrim: /^\s*\(?\s*/
            });
        } else if (nextTokenType === RParen) {
            finalSuggestions.push({
                type: "other",
                name: ")",
                text: ") ",
                prefixTrim: /\s*$/,
                postfixTrim: /^\s*\)?\s*/
            });
        } else if (nextTokenType === Identifier || nextTokenType === StringLiteral) {
            if (!outsideAggregation && currentAggregationToken) {
                let aggregationShort = aggregationsMap.get(getImage(currentAggregationToken));
                let aggregationOption = _.findWhere(tableMetadata.aggregation_options, { short: aggregationShort });
                if (aggregationOption && aggregationOption.fields.length > 0) {
                    finalSuggestions.push(...aggregationOption.fields[0].map(field => ({
                        type: "fields",
                        name: field.display_name,
                        text: formatFieldName(field) + " ",
                        prefixTrim: /\w+$/,
                        postfixTrim: /^\w+\s*/
                    })))
                    finalSuggestions.push(...Object.keys(customFields || {}).map(expressionName => ({
                        type: "fields",
                        name: expressionName,
                        text: formatExpressionName(expressionName) + " ",
                        prefixTrim: /\w+$/,
                        postfixTrim: /^\w+\s*/
                    })))
                }
            }
        } else if (nextTokenType === Aggregation) {
            if (outsideAggregation) {
                finalSuggestions.push(...tableMetadata.aggregation_options.filter(a => formatAggregationName(a)).map(aggregationOption => {
                    const arity = aggregationOption.fields.length;
                    return {
                        type: "aggregations",
                        name: formatAggregationName(aggregationOption),
                        text: formatAggregationName(aggregationOption) + "(" + (arity > 0 ? "" : ")"),
                        postfixText: arity > 0 ? ")" : "",
                        prefixTrim: /\w+$/,
                        postfixTrim: /^\w+\(\)?/
                    };
                }));
                finalSuggestions.push(...tableMetadata.metrics.map(metric => ({
                    type: "metrics",
                    name: metric.name,
                    text: formatMetricName(metric) + "() ",
                    prefixTrim: /\w+$/,
                    postfixTrim: /^\w+\(\)?/
                })))
            }
        } else if (nextTokenType === NumberLiteral) {
            // skip number literal
        } else {
            console.warn("non exhaustive match", nextTokenType.name, suggestion)
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
