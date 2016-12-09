const { Lexer, Parser, extendToken, getImage } = require("chevrotain");
const _ = require("underscore");

import { VALID_AGGREGATIONS } from "metabase/lib/expressions";

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
const allTokens = [
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

        $.RULE("expression", function () {
            return $.SUBRULE($.additionExpression)
        });

        // Lowest precedence thus it is first in the rule chain
        // The precedence of binary expressions is determined by
        // how far down the Parse Tree the binary expression appears.
        $.RULE("additionExpression", () => {
            let value = $.SUBRULE($.multiplicationExpression);
            $.MANY(() => {
                const op = $.CONSUME(AdditiveOperator);
                const rhsVal = $.SUBRULE2($.multiplicationExpression);

                if (Array.isArray(value) && value[0] === op.image) {
                    value.push(rhsVal);
                } else {
                    value = [op.image, value, rhsVal]
                }
            });
            return value
        });

        $.RULE("multiplicationExpression", () => {
            let value = $.SUBRULE($.atomicExpression);
            $.MANY(() => {
                const op = $.CONSUME(MultiplicativeOperator);
                const rhsVal = $.SUBRULE2($.atomicExpression);

                if (Array.isArray(value) && value[0] === op.image) {
                    value.push(rhsVal);
                } else {
                    value = [op.image, value, rhsVal]
                }
            });
            return value
        });

        $.RULE("aggregationExpression", () => {
            const agg = $.CONSUME(Aggregation).image;
            let value = [aggregationsMap.get(agg)]
            $.CONSUME(LParen);
            $.OPTION(() => {
                value.push($.SUBRULE($.expression));
                $.MANY(() => {
                    $.CONSUME(Comma);
                    value.push($.SUBRULE2($.expression));
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

        $.RULE("atomicExpression", () => {
            return $.OR([
                {ALT: () => $.SUBRULE($.parenthesisExpression) },
                {ALT: () => $.SUBRULE($.aggregationExpression) },
                {ALT: () => $.SUBRULE($.fieldExpression) },
                {ALT: () => parseFloat($.CONSUME(NumberLiteral).image) }
            ]);
        });

        $.RULE("parenthesisExpression", () => {
            let expValue;

            $.CONSUME(LParen);
            expValue = $.SUBRULE($.expression);
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

export function compile(source, { fields } = {}) {
    if (!source) {
        return [];
    }
    const parser = new ExpressionsParser(ExpressionsLexer.tokenize(source).tokens, fields);
    const expression = parser.expression();
    if (parser.errors.length > 0) {
        throw parser.errors;
    }
    return expression;
}

export function suggest(source, { index = source.length, fields } = {}) {
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

    const syntacticSuggestions = parserInstance.computeContentAssist("expression", assistanceTokenVector)

    let finalSuggestions = []

    for (const suggestion of syntacticSuggestions) {
        const { nextTokenType, ruleStack } = suggestion;

        if (nextTokenType === MultiplicativeOperator || nextTokenType === AdditiveOperator) {
            let tokens = getSubTokenTypes(nextTokenType);
            finalSuggestions.push(...tokens.map(token => ({
                type: "operator",
                name: getTokenSource(token),
                text: " " + getTokenSource(token) + " ",
                prefixTrim: /\s+$/,
                postfixTrim: /^\s+/
            })))
        } else if (nextTokenType === LParen) {
            finalSuggestions.push({
                type: "other",
                name: "(",
                "text": "(",
                postfixText: ")",
                prefixTrim: /\s+$/,
                postfixTrim: /^\s+/
            });
        } else if (nextTokenType === RParen) {
            finalSuggestions.push({
                type: "other",
                name: ")",
                text: ")",
                prefixTrim: /\s+$/,
                postfixTrim: /^\s+/
            });
        } else if (nextTokenType === Identifier || nextTokenType === StringLiteral) {
            finalSuggestions.push(...fields.map(field => ({
                type: "field",
                name: field.display_name,
                text: /^\w+$/.test(field.display_name) ?
                    field.display_name + " " : JSON.stringify(field.display_name),
                prefixTrim: /\w+$/,
                postfixTrim: /^\w+\s*/
            })))
        } else if (nextTokenType === Aggregation) {
            // no nesting of aggregations
            if (ruleStack.slice(0, -1).indexOf("aggregationExpression") < 0) {
                let tokens = getSubTokenTypes(nextTokenType);
                finalSuggestions.push(...tokens.map(token => ({
                    type: "aggregation",
                    name: getTokenSource(token),
                    text: getTokenSource(token) + "(",
                    postfixText: ")",
                    prefixTrim: /\w+$/,
                    postfixTrim: /^\w+\(/
                })))
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

    // we could have duplication because each suggestion also includes a Path, and the same Token may appear in multiple suggested paths.
    return _.chain(finalSuggestions)
        .uniq(suggestion => suggestion.text)
        .sortBy("name")
        .sortBy("type")
        .value();
}
