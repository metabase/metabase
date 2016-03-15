import React, { Component, PropTypes } from 'react';

import _ from 'underscore';

import Icon from "metabase/components/Icon.jsx";


const VALID_OPERATORS = new Set(['+', '-', '*', '/']);

const ERROR_MESSAGE_EMPTY_NAME       = 'what should this expression be called?';
const ERROR_MESSAGE_EMPTY_EXPRESSION = 'enter an expression';


export default class ExpressionWidget extends Component {
    constructor(props, context) {
        super(props, context);
        _.bindAll(this, 'parseToken', 'parseExpression', 'tokenizeExpressionString', 'updateName', 'updateExpression', 'removeExpression');
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
        console.log('newProps:', newProps);
        let parsedExpression = newProps.expression[0],
            expressionString = newProps.expression[1];
        this.setState({
            name:                   newProps.name,
            parsedExpression:       parsedExpression,
            expressionString:       expressionString,
            nameErrorMessage:       newProps.name.length    ? null : ERROR_MESSAGE_EMPTY_NAME,
            expressionErrorMessage: expressionString.length ? null : ERROR_MESSAGE_EMPTY_EXPRESSION
        });
    }

    componentWillUnmount() {
        console.log('componentWillUnmount() state ->', this.state);
        if (this.state.nameErrorMessage || this.state.expressionErrorMessage) {
            this.props.removeExpression(this.state.name);
        } else {
            this.props.updateName(this.props.name, this.state.name);
            this.props.updateExpression(this.state.name, [this.state.parsedExpression, this.state.expressionString]);
        }
    }

    parseToken(token) {
        // check if token is a nested expression
        if (token.constructor === Array) return this.parseExpression(token);

        // check if the token is a number
        let numericValue = parseFloat(token);
        if (!isNaN(numericValue)) return numericValue;

        // if not, it is a field name
        let fields = this.props.tableMetadata.fields;
        let field = _.findWhere(fields, {name: token});
        if (!field) throw 'no field named "' + token + '"';
        return ["field-id", field.id];
    }

    parseExpression(tokens) {
        // unnest excess parens
        if (tokens.length === 1 && tokens[0].constructor === Array) return this.parseExpression(tokens[0]);

        let [lhs, operator, rhs] = tokens;

        if (!lhs) throw 'expression is empty';
        lhs = this.parseToken(lhs);

        if (!operator) throw 'missing operator';
        if (!VALID_OPERATORS.has(operator)) throw 'invalid operator: ' + operator;

        if (!rhs) throw 'add something to the right of ' + operator;
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
            console.log('c:', c, ', i:', i, ', level:', level, ', tokens:', tokens, ', currentToken:', currentToken,);

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
        console.log('updateName:', newName);

        this.setState({
            nameErrorMessage: newName.length ? null : ERROR_MESSAGE_EMPTY_NAME,
            name: newName
        });
    }

    updateExpression(expressionString) {
        console.log('updateExpression:', expressionString);

        var errorMessage = null,
            parsedExpression = null;

        try {
            let tokens = this.tokenizeExpressionString(expressionString);
            parsedExpression = this.parseExpression(tokens);
            console.log('tokens -> ', tokens);
            console.log('parsedExpression:', parsedExpression);
        } catch (e) {
            console.log('error:', e);
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
                />
                <a onClick={() => this.removeExpression()}>
                    <Icon name='close' width="12px" height="12px" />
                </a>
                <p className={errorMessage ? 'text-warning' : 'text-green'}>
                    {errorMessage || '✓ expression is valid'}
                </p>
            </div>
        );
        // TODO - CSS
    }
}
