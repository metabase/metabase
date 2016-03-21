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


export default class ExpressionWidget extends Component {
    constructor(props, context) {
        super(props, context);
        _.bindAll(this, 'parseToken', 'parseExpression', 'tokenizeExpressionString', 'updateName', 'updateExpression', 'removeExpression', 'updateSuggestions', 'onExpressionInputKeyDown',
                        'onExpressionInputBlur', 'onExpressionInputFocus');
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
            expressionString = newProps.expression[1];
        this.setState({
            name:                   newProps.name,
            parsedExpression:       parsedExpression,
            expressionString:       expressionString,
            nameErrorMessage:       newProps.name.length    ? null : ERROR_MESSAGE_EMPTY_NAME,
            expressionErrorMessage: expressionString.length ? null : ERROR_MESSAGE_EMPTY_EXPRESSION,
            suggestions:            [],
            highlightedSuggestion:  0,
            suggestionsTitle:       'FIELDS'
        });
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
            let suggestedField = this.state.suggestions[this.state.highlightedSuggestion];

            // strip off the last partial token
            let expression = this.state.expressionString.replace(new RegExp('\\s*[^\\s]+$'), '');

            // tack on the new token
            expression = expression.length ? (expression + ' ' + suggestedField.name) : suggestedField.name;

            this.updateExpression(expression + ' '); // add a blank space after end of token

        } else if (event.keyCode === KEYCODE_UP) {
            this.setState({
                highlightedSuggestion: this.state.highlightedSuggestion === 0 ? (this.state.suggestions.length - 1) : (this.state.highlightedSuggestion - 1)
            });
            event.preventDefault(); // don't move to beginning of text field
        } else if (event.keyCode === KEYCODE_DOWN) {
            this.setState({
                highlightedSuggestion: this.state.highlightedSuggestion === (this.state.suggestions.length - 1) ? 0 : (this.state.highlightedSuggestion + 1)
            });
            event.preventDefault(); // don't move to end of text field
        } else return;
    }

    onExpressionInputBlur() {
        this.setState({
            suggestions: [],
            highlightedSuggestion: 0
        });
    }

    onExpressionInputFocus() {
        this.updateExpression(this.state.expressionString); // trigger update of state related to expression so autocomplete will pop up, etc.
    }

    /// update suggestions with ones for fieldName
    updateSuggestions(fieldName) {
        let suggestions = _.filter(this.props.tableMetadata.fields, function(field) {
            // case-insensitive, but don't suggest exact matches (e.g. if field name is already valid don't keep autocomplete box open)
            return field.name.toLowerCase().indexOf(fieldName.toLowerCase()) > -1 && field.name !== fieldName;
        });
        suggestions = _.sortBy(suggestions, 'name');

        var highlightedSuggestion = this.state.highlightedSuggestion;
        if (highlightedSuggestion >= suggestions.length) highlightedSuggestion = suggestions.length - 1;
        if (highlightedSuggestion < 0)                   highlightedSuggestion = 0;

        this.setState({
            suggestions:           suggestions,
            highlightedSuggestion: highlightedSuggestion,
            suggestionsTitle:      'FIELDS'
        });
    }

    parseToken(token) {
        // check if token is a nested expression
        if (token.constructor === Array) return this.parseExpression(token);

        // check if the token is a number
        let numericValue = parseFloat(token);
        if (!isNaN(numericValue)) return numericValue;

        // if not, it is a field name
        this.updateSuggestions(token);

        let fields = this.props.tableMetadata.fields;
        let field = _.findWhere(fields, {name: token});
        if (!field) throw 'no field named "' + token + '"';
        return ["field-id", field.id];
    }

    parseExpression(tokens) {
        // unnest excess parens
        if (tokens.length === 1 && tokens[0].constructor === Array) return this.parseExpression(tokens[0]);

        let [lhs, operator, rhs] = tokens;

        if (!lhs) {
            this.updateSuggestions(''); // show suggestions for all fields
            throw 'expression is empty';
        }

        lhs = this.parseToken(lhs);

        if (!operator) {
            this.setState({
                suggestions:           OPERATOR_SUGGESTIONS,
                highlightedSuggestion: 0,
                suggestionsTitle:      'OPERATORS'
            });
            throw 'missing operator';
        }

        if (!VALID_OPERATORS.has(operator)) throw 'invalid operator: ' + operator;

        if (!rhs) {
            this.updateSuggestions(''); // show suggestions for all fields
            throw 'add something to the right of ' + operator;
        }
        // if we have more than one remaining arg recur to parse a nested expression
        rhs = tokens.length > 3 ? this.parseExpression(tokens.slice(2)) : this.parseToken(rhs);

        return [operator, lhs, rhs];
    }

    // e.g. '  field + field2 + (field3  -  field4)' -> ['field', '+', 'field2', ['field3', '-', 'field4']]
    tokenizeExpressionString(expressionString, i = 0, level = 0) {
        var tokens = [],
            currentToken = null;

        for (; i < expressionString.length; i++) {
            let c = expressionString.charAt(i);

            if (c === ' ' || c === '\n') {
                if (currentToken) {
                    tokens.push(currentToken);
                    currentToken = null;
                }
            }
            else if (c === '(') {
                if (currentToken) throw 'invalid token: ' + currentToken + '(';
                var token;
                [token, i] = this.tokenizeExpressionString(expressionString, i + 1, level + 1); // parse recursively starting at point immediately after opening paren
                tokens.push(token);
            }
            else if (c === ')') {
                if (level === 0) throw 'expression is missing an opening paren';
                if (currentToken) tokens.push(currentToken);
                return [tokens, i + 1];
            }
            else {
                if (!currentToken) currentToken = '';
                currentToken += c;
            }
        }

        if (level !== 0) throw 'expression is missing a closing paren';

        if (currentToken) tokens.push(currentToken);
        return tokens;
    }

    updateName(newName) {
        this.setState({
            nameErrorMessage: newName.length ? null : ERROR_MESSAGE_EMPTY_NAME,
            name: newName
        });
    }

    updateExpression(expressionString) {
        var errorMessage = null,
            parsedExpression = null;

        try {
            let tokens = this.tokenizeExpressionString(expressionString);
            parsedExpression = this.parseExpression(tokens);
        } catch (e) {
            errorMessage = e;
        }

        this.setState({
            expressionErrorMessage: errorMessage,
            expressionString: expressionString,
            parsedExpression: parsedExpression
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
                       onChange={(event) => this.updateExpression(event.target.value)}
                       value={this.state.expressionString}
                       placeholder="expression"
                       onKeyDown={this.onExpressionInputKeyDown}
                       onBlur={this.onExpressionInputBlur}
                       onFocus={this.onExpressionInputFocus}
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
