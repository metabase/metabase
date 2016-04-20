
import _ from "underscore";

const VALID_OPERATORS = new Set(['+', '-', '*', '/']);

function isField(arg) {
    return arg && arg.constructor === Array && arg.length === 2 && arg[0] === 'field-id' && typeof arg[1] === 'number';
}

export function isExpression(arg) {
    return arg && arg.constructor === Array && arg.length === 3 && VALID_OPERATORS.has(arg[0]) && isValidArg(arg[1]) && isValidArg(arg[2]);
}

function isValidArg(arg) {
    return isExpression(arg) || isField(arg) || typeof arg === 'number';
}

function formatField(fieldRef, fields) {
    let fieldID = fieldRef[1],
        field   = _.findWhere(fields, {id: fieldID});

    if (!field) throw 'field with ID does not exist: ' + fieldID;

    let displayName = field.display_name;
    return displayName.indexOf(' ') === -1 ? displayName : ('"' + displayName + '"');
}

function formatNestedExpression(expression, fields) {
    return '(' + formatExpression(expression, fields) + ')';
}

function formatArg(arg, fields) {
    if (!isValidArg(arg)) throw 'Invalid expression argument:' + arg;

    return isField(arg)            ? formatField(arg, fields)            :
           isExpression(arg)       ? formatNestedExpression(arg, fields) :
           typeof arg === 'number' ? arg                                 :
                                     null;
}

/// convert a parsed expression back into an expression string
export function formatExpression(expression, fields) {
    console.log('formatExpression(expression =', expression, ", fields =", fields, ')');

    if (!expression)               return null;
    if (!isExpression(expression)) throw 'Invalid expression: ' + expression;

    let [operator, arg1, arg2] = expression;
    let output = formatArg(arg1, fields) + ' ' + operator + ' ' + formatArg(arg2, fields);
    console.log('formatted:', output);
    return output;
}


// str -> tokens
/// update suggestions with ones for fieldName
function getSuggestions(fieldName, fields) {
    if (!fieldName) fieldName = '';

    let suggestions = _.filter(fields, function(field) {
        return field.display_name.toLowerCase().indexOf(fieldName.toLowerCase()) > -1;
    });

    // don't suggest anything if the only suggestion is for the token we already have
    if (suggestions.length === 1 && suggestions[0].display_name === fieldName) suggestions = [];

    return _.sortBy(suggestions, function(field) {
        return field.display_name.toLowerCase();
    });
}

function parseToken(token, fields, operators) {
    console.log('parseToken(', token, ')');
    if (!token || typeof token !== 'object' || !token.value || !token.value.length) {
        console.error('tokenization error: invalid token: ', token);
        return null;
    }

    // check if token is a nested expression
    if (token.isParent) {
        token.value = parseExpression(token.value, fields, operators);
        return token;
    }

    // check if the token is a number
    let numericValue = parseFloat(token.value);
    if (!isNaN(numericValue)) {
        token.parsedValue = numericValue;
        return token;
    }

    // if not, it is a field name
    let fieldName = token.value.replace(/^"?(.*)"?$/, '$1'); // strip off any quotes around the field name
    token.suggestions = getSuggestions(fieldName, fields);

    let field = _.find(fields, function(field) {
        return field.display_name.toLowerCase() === fieldName.toLowerCase();
    });

    if (field) token.parsedValue = ['field-id', field.id];
    else       token.error = 'no field named "' + fieldName + '"';

    return token;
}

function parseExpression(tokens, fields, operators) {
    console.log('parseExpression(', tokens, ')');
    // unnest excess parens
    if (tokens.length === 1 && tokens[0].isParent) return parseExpression(tokens[0].value, fields, operators);

    let [lhs, operator, rhs] = tokens;

    lhs = lhs ? parseToken(lhs, fields, operators) : {
        token: '',
        start: 0,
        end: 0,
        error: 'expression is empty',
        suggestions: getSuggestions('', fields),
        suggestionsTitle: 'FIELDS'
    };

    if (operator && operator.value && operator.value.length) {
        if (!operators.has(operator.value)) operator.error       = 'invalid operator: ' + operator.value;
        else                                operator.parsedValue = operator.value;
    } else {
        operator = {
            token: '',
            start: lhs.end + 1,
            end: lhs.end + 1,
            error: 'missing operator',
            suggestions: Array.from(operators).map((operator) => ({display_name: operator})),
            suggestionsTitle: 'OPERATORS'
        };
    }

    // if we have > 3 tokens group the rest
    if (tokens.length > 3) {
        tokens = tokens.slice(2);
        rhs = {
            value: parseExpression(tokens, fields, operators),
            isParent: true,
            start: tokens[0].start,
            end: tokens[tokens.length - 1].end
        };
    }
    else rhs = rhs ? parseToken(rhs, fields, operators) : {
        token: '',
        start: operator.end + 1,
        end: operator.end + 1,
        error: 'add something to the right of ' + operator.value,
        suggestions: getSuggestions('', fields),
        suggestionsTitle: 'FIELDS'
    };

    return [lhs, operator, rhs];
}

function tokenizeExpression(expression, i = 0, level = 0) {
    console.log('tokenizeExpression(', expression, ', i =', i, ', level =', level, ')');
    var tokens       = [],
        currentToken = null,
        start        = i,
        insideQuotes = false;

    for (; i < expression.length; i++) {
        let c = expression.charAt(i);

        if (c === '"') {
            insideQuotes = !insideQuotes;
        }
        else if ((c === ' ' || c === '\n') && !insideQuotes) {
            if (currentToken) {
                tokens.push({
                    value: currentToken,
                    start: start,
                    end: i
                });
                currentToken = null;
                start = i + 1;
            }
        }
        else if (c === '(' && !insideQuotes) {
            // TODO - this is probably actually ok, we should accept it as a token separate from the parens
            if (currentToken) throw 'invalid token: ' + currentToken + '(';

            let nestedResults = tokenizeExpression(expression, i + 1, level + 1); // parse recursively starting at point immediately after opening paren
            console.log('nestedResults = ', nestedResults);

            if (nestedResults.constructor !== Array) {
                console.error('not an array: ', nestedResults);
                throw 'expected array, got ' + typeof nestedResults;
            }

            var token;
            [token, i] = nestedResults;

            tokens.push({
                value: token,
                start: start,
                end: i,
                isParent: true
            });
        }
        else if (c === ')' && !insideQuotes) {
            if (level === 0) throw 'expression is missing an opening paren';
            if (currentToken) tokens.push({
                value: currentToken,
                start: start,
                end: i - 1
            });
            return [tokens, i + 1];
        }
        else {
            if (!currentToken) {
                currentToken = '';
                start = i;
            }
            currentToken += c;
        }
    }

    if (level !== 0) {
        if (currentToken) {
            tokens.push({
                value: currentToken,
                start: start,
                end: i
            });
        }
        if (tokens.length) tokens[tokens.length - 1].error = 'expression is missing a closing paren';
        else               throw 'expression is missing a closing paren';

        return [tokens, i];
    }

    if (currentToken) tokens.push({
        value: currentToken,
        start: start,
        end: i
    });

    return tokens;
}

// Takes a string representation of an expression and parses it into an array of structured tokens
export function parseExpressionString(expression, fields) {
    if (_.isEmpty(expression)) return [];

    let tokens = tokenizeExpression(expression);
    return parseExpression(tokens, fields, VALID_OPERATORS);
}


// return the token underneath a cursor position
export function tokenAtPosition(tokens, position) {
    if (!tokens || !tokens.length) return null;

    console.log('tokenAtPosition(', tokens, position, ')');
    for (var i = 0; i < tokens.length; i++) {
        let token = tokens[i];

        if (token.start <= position && token.end >= position) {
            return token.isParent ? tokenAtPosition(token.value, position) : token;
        }
    }
}


// Takes an array of tokens representing a parsed string based expression
// and restructures them into a valid MBQL expression clause
export function tokensToExpression(tokens) {
    console.log('getParsedExpression(', tokens, ')');

    if (!tokens || tokens.constructor !== Array || tokens.length !== 3) return null;

    var [lhs, operator, rhs] = tokens;

    if (lhs.error)      throw lhs.error;
    if (operator.error) throw operator.error;
    if (rhs.error)      throw rhs.error;

    operator = operator.parsedValue;
    lhs = lhs.isParent ? tokensToExpression(lhs.value) : lhs.parsedValue;
    rhs = rhs.isParent ? tokensToExpression(rhs.value) : rhs.parsedValue;

    if (!operator) throw 'invalid operator!';
    if (!lhs)      throw 'invalid lhs!';
    if (!rhs)      throw 'invalid rhs!';

    return [operator, lhs, rhs];
}
