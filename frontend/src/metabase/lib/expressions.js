
import _ from "underscore";

// +----------------------------------------------------------------------------------------------------------------------------------------------------------------+
// |                                                                      PREDICATE FUNCTIONS                                                                       |
// +----------------------------------------------------------------------------------------------------------------------------------------------------------------+

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


// +----------------------------------------------------------------------------------------------------------------------------------------------------------------+
// |                                                                   MBQL EXPRESSION -> STRING                                                                    |
// +----------------------------------------------------------------------------------------------------------------------------------------------------------------+

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
    if (!expression)               return null;
    if (!isExpression(expression)) throw 'Invalid expression: ' + expression;

    let [operator, arg1, arg2] = expression;
    let output = formatArg(arg1, fields) + ' ' + operator + ' ' + formatArg(arg2, fields);

    return output;
}



// +----------------------------------------------------------------------------------------------------------------------------------------------------------------+
// |                                                                        STRING -> TOKENS                                                                        |
// +----------------------------------------------------------------------------------------------------------------------------------------------------------------+

// takes the results of tokenizeExpression() and handles nesting the parentheses
// e.g. ['(', {value: '"PRODUCT ID"', start: 0, end: 11}, {value: '+', start: 13, end: 14}, ')']
// becomes [{isParent: true, value: [...], start: 0, end: 11}]
function groupTokens(tokens) {
    var groupsStack = [[]];

    function push(item) {
        _.last(groupsStack).push(item);
    }

    function pushNewGroup() {
        groupsStack.push([]);
    }

    function closeGroup() {
        if (groupsStack.length === 1) {
            _.last(groupsStack)[0].error = 'Missing opening paren'; // set error on first element of topmost group
        }

        let group = _.last(groupsStack);
        groupsStack.splice(-1); // pop the last group from the groups stack

        push({
            value: group,
            start: group[0].start,
            end: _.last(group).end,
            isParent: true
        });
    }

    for (var i = 0; i < tokens.length; i++) {
        let token = tokens[i];

        if      (token === '(') pushNewGroup();
        else if (token === ')') closeGroup();
        else                    push(token);
    }

    if (groupsStack.length > 1) {
        closeGroup();
        _.last(groupsStack[0]).error = 'Missing closing paren'; // set error on last element of top-level group
    }

    return groupsStack[0];
}

// take a string like '"PRODUCT ID" + (ID * 2)"'
// and return tokens like [{value: '"PRODUCT ID"', start: 0, end: 11}, {value: '+', start: 13, end: 14}, '(', ...]
function tokenizeExpression(expressionString) {
    var i            = 0,
        tokens       = [],
        currentToken = null,
        insideString = false;

    function pushCurrentTokenIfExists() {
        if (currentToken) {
            currentToken.end = i;
            tokens.push(currentToken);
            currentToken = null;
        }
    }

    function appendCharToCurrentToken(c) {
        if (!currentToken) currentToken = {
            start: i,
            value: ''
        };
        currentToken.value += c;
    }

    // Replace operators in expressionString making sure the operators have exactly one space before and after
    VALID_OPERATORS.forEach(function(operator) {
        let regex = new RegExp("\\s*[\\" + operator + "]\\s*");
        expressionString = expressionString.replace(regex, ' ' + operator + ' ');
    });

    for (; i < expressionString.length; i++) {
        let c = expressionString.charAt(i);

        if (c === '"') {
            pushCurrentTokenIfExists();
            insideString = !insideString;
        }
        else if (insideString) {
            appendCharToCurrentToken(c);
        }
        else if (c === '(' || c === ')') {
            pushCurrentTokenIfExists();
            tokens.push(c);
        }
        else if (c === ' ' || c === '\n') {
            pushCurrentTokenIfExists();
        }
        else {
            appendCharToCurrentToken(c);
        }
    }

    pushCurrentTokenIfExists();

    return tokens;
}


// +----------------------------------------------------------------------------------------------------------------------------------------------------------------+
// |                                                                   TOKENS -> MBQL EXPRESSION                                                                    |
// +----------------------------------------------------------------------------------------------------------------------------------------------------------------+

// takes a token and returns the appropriate MBQL form, e.g. a field name becomnes [field-id <id>]
function tokenToMBQL(token, fields, operators) {
    if (!token || typeof token !== 'object' || !token.value || !token.value.length) {
        console.error('tokenization error: invalid token: ', token);
        return null;
    }

    // check if token is a nested expression
    if (token.isParent) {
        token.value = annotateTokens(token.value, fields, operators);
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
    token.suggestions = getFieldSuggestions(fieldName, fields);

    let field = _.find(fields, function(field) {
        return field.display_name.toLowerCase() === fieldName.toLowerCase();
    });

    if (field) token.parsedValue = ['field-id', field.id];
    else       token.error = 'no field named "' + fieldName + '"';

    return token;
}

// Add extra info about the tokens, like errors + suggestions
function annotateTokens(tokens, fields, operators) {
    // unnest excess parens
    if (tokens.length === 1 && tokens[0].isParent) return annotateTokens(tokens[0].value, fields, operators);

    let [lhs, operator, rhs] = tokens;

    lhs = lhs ? tokenToMBQL(lhs, fields, operators) : {
        token: '',
        start: 0,
        end: 0,
        error: 'expression is empty',
        suggestions: getFieldSuggestions('', fields),
        suggestionsTitle: 'FIELDS'
    };

    if (operator && operator.value && operator.value.length) {
        if (!operators.has(operator.value)) operator.error       = 'invalid operator: ' + operator.value;
        else                                operator.parsedValue = operator.value;
    } else {
        operator = {
            token: '',
            start: lhs.end + 1,
            end: lhs.end + 2,
            error: 'missing operator',
            suggestions: Array.from(operators).map((operator) => ({display_name: operator})),
            suggestionsTitle: 'OPERATORS'
        };
    }

    // if we have > 3 tokens group the rest
    // TODO - this should be moved into groupTokens
    if (tokens.length > 3) {
        tokens = tokens.slice(2);
        rhs = {
            value: annotateTokens(tokens, fields, operators),
            isParent: true,
            start: tokens[0].start,
            end: tokens[tokens.length - 1].end
        };
    }
    else rhs = rhs ? tokenToMBQL(rhs, fields, operators) : {
        token: '',
        start: operator.end + 1,
        end: operator.end + 2,
        error: 'add something to the right of ' + operator.value,
        suggestions: getFieldSuggestions('', fields),
        suggestionsTitle: 'FIELDS'
    };

    return [lhs, operator, rhs];
}


// Takes a string representation of an expression and parses it into an array of structured tokens
// the results still need to go through tokensToExpression to be converted to MBQL
export function parseExpressionString(expression, fields) {
    if (_.isEmpty(expression)) return [];

    return annotateTokens(groupTokens(tokenizeExpression(expression)), fields, VALID_OPERATORS);
}

// Takes an array of tokens representing a parsed string based expression
// and restructures them into a valid MBQL expression clause
export function tokensToExpression(tokens) {
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


// +----------------------------------------------------------------------------------------------------------------------------------------------------------------+
// |                                                                              MISC                                                                              |
// +----------------------------------------------------------------------------------------------------------------------------------------------------------------+

/// update suggestions with ones for fieldName
function getFieldSuggestions(fieldName, fields) {
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


// return the token underneath a cursor position
export function tokenAtPosition(tokens, position) {
    if (!tokens || !tokens.length) return null;

    for (var i = 0; i < tokens.length; i++) {
        let token = tokens[i];

        if (token.start <= position && token.end >= position) {
            return token.isParent ? tokenAtPosition(token.value, position) : token;
        }
    }
}
