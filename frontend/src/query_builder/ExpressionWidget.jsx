import React, { Component, PropTypes } from 'react';

import _ from 'underscore';

import Icon from "metabase/components/Icon.jsx";
import Popover from "metabase/components/Popover.jsx";


const VALID_OPERATORS = new Set(['+', '-', '*', '/']);

const OPERATOR_SUGGESTIONS = [
    {name: '+'},
    {name: '-'},
    {name: '*'},
    {name: '/'}
];

const ERROR_MESSAGE_EMPTY_NAME       = 'what should this expression be called?';
const ERROR_MESSAGE_EMPTY_EXPRESSION = 'enter an expression';

const KEYCODE_ENTER = 13;
const KEYCODE_UP    = 38;
const KEYCODE_DOWN  = 40;


function tokenizeExpression(expression, i = 0, level = 0) {
    var tokens = [],
        currentToken = null,
        start = i;

    for (; i < expression.length; i++) {
        let c = expression.charAt(i);

        if (c === ' ' || c === '\n') {
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
        else if (c === '(') {
            // TODO - this is probably actually ok, we should accept it as a token separate from the parens
            if (currentToken) throw 'invalid token: ' + currentToken + '(';

            var token;
            [token, i] = tokenizeExpression(expression, i + 1, level + 1); // parse recursively starting at point immediately after opening paren
            tokens.push({
                value: token,
                start: start,
                end: i,
                isParent: true
            });
        }
        else if (c === ')') {
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

    if (level !== 0) throw 'expression is missing a closing paren';

    if (currentToken) tokens.push({
        value: currentToken,
        start: start,
        end: i
    });

    return tokens;
}

// return the token underneath a cursor position
function tokenAtPosition(tokens, position) {
    if (!tokens || !tokens.length) return null;

    console.log('tokenAtPosition(', tokens, position, ')');
    for (var i = 0; i < tokens.length; i++) {
        let token = tokens[i];

        if (token.start <= position && token.end >= position) {
            return token.isParent ? tokenAtPosition(token.value, position) : token;
        }
    }
}

// return the first token with a non-empty error message
function getErrorToken(tokens) {
    for (var i = 0; i < tokens.length; i++) {
        let token = tokens[i];
        if (token.error && token.error.length) return token;
        if (!token.isParent) continue;
        let childError = getErrorToken(token.value);
        if (childError) return childError;
    }
}

function getParsedExpression(tokens) {
    if (!tokens || tokens.constructor !== Array || tokens.length !== 3) return null;

    try {
        let [lhs, operator, rhs] = tokens;

        return [operator.parsedValue, lhs.parsedValue, rhs.parsedValue];
    } catch (e) {
        console.error(e);
    }
}


export default class ExpressionWidget extends Component {
    constructor(props, context) {
        super(props, context);
        _.bindAll(this, 'parseToken', 'parseExpression', 'updateName', 'onExpressionInputChange', 'removeExpression', 'getSuggestions', 'onExpressionInputKeyDown',
                  'onExpressionInputBlur');
    }

    static propTypes = {
        tableMetadata:    PropTypes.object.isRequired,
        updateExpression: PropTypes.func.isRequired,
        updateName:       PropTypes.func.isRequired,
        removeExpression: PropTypes.func.isRequired,
        name:             PropTypes.string.isRequired,
        expression:       PropTypes.array.isRequired    // should be an array like [parsedExpressionObj, expressionStringi
    };

    componentWillMount() {
        this.componentWillReceiveProps(this.props);
    }

    componentWillReceiveProps(newProps) {
        let parsedExpression = newProps.expression[0],
            expression       = newProps.expression[1],
            tokens           = this.parseExpression(tokenizeExpression(expression))
        this.setState({
            name:                   newProps.name,
            parsedExpression:       parsedExpression,
            expressionString:       expression,
            tokens:                 tokens,
            nameErrorMessage:       newProps.name.length ? null : ERROR_MESSAGE_EMPTY_NAME,
            expressionErrorMessage: expression.length    ? null : ERROR_MESSAGE_EMPTY_EXPRESSION,
            suggestions:            [],
            highlightedSuggestion:  0,
            suggestionsTitle:       'FIELDS'
        });

        console.log('component recieved props, state is now: ', this.state);
    }

    componentWillUnmount() {
        if (this.state.nameErrorMessage || this.state.expressionErrorMessage) {
            this.props.removeExpression(this.state.name);
        } else {
            this.props.updateName(this.props.name, this.state.name);
            this.props.updateExpression(this.state.name, [this.state.parsedExpression, this.state.expressionString]);
        }
    }

    onExpressionInputKeyDown(event) {
        if (!this.state.suggestions.length) return;

        if (event.keyCode === KEYCODE_ENTER) {
            let suggestion = this.state.suggestions[this.state.highlightedSuggestion].name;
            let tokenAtPoint = tokenAtPosition(this.state.tokens, event.target.selectionStart);

            console.log('replacing:', tokenAtPoint, 'with:', suggestion);

            let expression = this.state.expressionString.substring(0, tokenAtPoint.start) + suggestion + this.state.expressionString.substring(tokenAtPoint.end, this.state.expressionString.length);

            event.target.value = expression + ' ';
            this.onExpressionInputChange(event); // add a blank space after end of token

            this.setState({
                highlightedSuggestion: 0
            });

        } else if (event.keyCode === KEYCODE_UP) {
            this.setState({
                highlightedSuggestion: this.state.highlightedSuggestion === 0 ? (this.state.suggestions.length - 1) : (this.state.highlightedSuggestion - 1)
            });
        } else if (event.keyCode === KEYCODE_DOWN) {
            this.setState({
                highlightedSuggestion: this.state.highlightedSuggestion === (this.state.suggestions.length - 1) ? 0 : (this.state.highlightedSuggestion + 1)
            });
        } else return;

        event.preventDefault();
    }

    onExpressionInputBlur() {
        this.setState({
            suggestions: [],
            highlightedSuggestion: 0
        });
    }

    /// update suggestions with ones for fieldName
    getSuggestions(fieldName) {
        if (!fieldName) fieldName = '';

        let suggestions = _.filter(this.props.tableMetadata.fields, function(field) {
            // return field.name.indexOf(fieldName) > 1;
            return field.name.toLowerCase().indexOf(fieldName.toLowerCase()) > -1;
        });

        // don't suggest anything if the only suggestion is for the token we already have
        if (suggestions.length === 1 && suggestions[0].name === fieldName) suggestions = [];

        return _.sortBy(suggestions, function(field) {
            return field.name.toLowerCase();
        });
    }

    parseToken(token) {
        if (typeof token !== 'object') console.error('not an object: ', token);

        // check if token is a nested expression
        if (token.isParent) return this.parseExpression(token);

        // check if the token is a number
        let numericValue = parseFloat(token.value);
        if (!isNaN(numericValue)) {
            token.parsedValue = numericValue;
            return token;
        }

        // if not, it is a field name
        token.suggestions = this.getSuggestions(token.value);

        let fields = this.props.tableMetadata.fields;
        let field = _.findWhere(fields, {name: token.value});
        if (!field) token.error = 'no field named "' + token.value + '"';

        if (field) token.parsedValue = ['field-id', field.id];

        return token;
    }

    parseExpression(tokens) {
        console.log('parseExpression(', tokens, ')');
        // unnest excess parens
        if (tokens.length === 1 && tokens[0].isParent) return this.parseExpression(tokens[0].value);

        let [lhs, operator, rhs] = tokens;

        lhs = lhs ? this.parseToken(lhs) : {
            token: '',
            start: 0,
            end: 0,
            error: 'expression is empty',
            suggestions: this.getSuggestions('')
        };

        if (operator) {
            if (!VALID_OPERATORS.has(operator.value)) operator.error       = 'invalid operator: ' + operator.value;
            else                                      operator.parsedValue = operator.value;
        } else {
            operator = {
                token: '',
                start: lhs.end + 1,
                end: lhs.end + 1,
                error: 'missing operator',
                suggestions: OPERATOR_SUGGESTIONS
            };
        }

        rhs = tokens.length > 3 ? this.parseExpression(tokens.slice(2)) :
              rhs               ? this.parseToken(rhs)                  : {
                  token: '',
                  start: operator.end + 1,
                  end: operator.end + 1,
                  error: 'add something to the right of ' + operator.value,
                  suggestions: this.getSuggestions('')
              };

        return [lhs, operator, rhs];
    }


    updateName(newName) {
        this.setState({
            nameErrorMessage: newName.length ? null : ERROR_MESSAGE_EMPTY_NAME,
            name: newName
        });
    }

    onExpressionInputChange(event) {
        let expression = event.target.value;

        var errorMessage = null,
            tokens = [],
            suggestions = [],
            highlightedSuggestion = this.state.highlightedSuggestion;

        try {
            tokens = tokenizeExpression(expression);
            console.log('tokens (before parse)', tokens);

            tokens = this.parseExpression(tokens);
            console.log('tokens (after parse):', tokens);

            let errorToken = getErrorToken(tokens);
            if (errorToken) errorMessage = errorToken.error;

            console.log('errorMessage: ', errorMessage);

            let cursorPosition = event.target.selectionStart;
            let tokenAtPoint = tokenAtPosition(tokens, cursorPosition);
            console.log('tokenAtPoint:', tokenAtPoint);

            if (tokenAtPoint && tokenAtPoint.suggestions) suggestions = tokenAtPoint.suggestions;

            if (highlightedSuggestion >= suggestions.length) highlightedSuggestion = suggestions.length - 1;
            if (highlightedSuggestion < 0)                   highlightedSuggestion = 0;

        } catch (e) {
            errorMessage = e;
        }


        this.setState({
            expressionErrorMessage: errorMessage,
            expressionString: expression,
            parsedExpression: getParsedExpression(tokens),
            suggestions: suggestions,
            highlightedSuggestion: highlightedSuggestion,
            tokens: tokens
        });
    }

    removeExpression() {
        this.props.removeExpression(this.state.name);
        this.setState({
            nameErrorMessage: 'see ya later, ' + this.state.name + '!'
        });
    }

    render() {
        let errorMessage = this.state.nameErrorMessage || this.state.expressionErrorMessage;

        console.log('suggestions:', this.state.suggestions, 'highlightedSuggestion:', this.state.highlightedSuggestion);
        let autocomplete = this.state.suggestions.length ? (
            <Popover className="p1"
                     tetherOptions={{
                             attachment: 'top center',
                             targetAttachment: 'bottom center',
                             targetOffset: '-20 45'
                         }}
            >
                <h5 className="text-grey-1">
                    {this.state.suggestionsTitle}
                </h5>
                <ul className="my1">
                    {this.state.suggestions.map((suggestion, i) => (
                         <li className={i == this.state.highlightedSuggestion ? 'text-bold text-brand' : null}>
                             {suggestion.name}
                         </li>
                     ))}
                </ul>
            </Popover>
        ) : null;

        return (
            <div className="align-center">
                <input type="text"
                       onChange={(event) => this.updateName(event.target.value)}
                       value={this.state.name}
                       placeholder="field name"
                />
                <input className="mx2" type="text"
                       onChange={this.onExpressionInputChange}
                       value={this.state.expressionString}
                       placeholder="expression"
                       onKeyDown={this.onExpressionInputKeyDown}
                       onBlur={this.onExpressionInputBlur}
                       onFocus={this.onExpressionInputChange}
                />
                <a onClick={() => this.removeExpression()}>
                    <Icon name='close' width="12px" height="12px" />
                </a>
                {autocomplete}
                <p className={errorMessage ? 'text-warning' : 'text-green'}>
                    {errorMessage || '✓ expression is valid'}
                </p>
            </div>
        );
        // TODO - CSS
    }
}
