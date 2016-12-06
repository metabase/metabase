import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import S from "./ExpressionEditorTextfield.css";

import _ from "underscore";
import cx from "classnames";

import { parse } from "metabase/lib/expressions/aggregation"

import Popover from "metabase/components/Popover.jsx";

import { formatExpression, isExpression } from "metabase/lib/expressions";


const KEYCODE_TAB   =  9;
const KEYCODE_ENTER = 13;
const KEYCODE_UP    = 38;
const KEYCODE_DOWN  = 40;


export default class ExpressionEditorTextfield extends Component {
    constructor(props, context) {
        super(props, context);
        _.bindAll(this, 'onInputChange', 'onInputKeyDown', 'onInputBlur', 'onSuggestionAccepted', 'onSuggestionMouseDown');
    }

    static propTypes = {
        expression: PropTypes.array,      // should be an array like [parsedExpressionObj, expressionString]
        tableMetadata: PropTypes.object.isRequired,
        onChange: PropTypes.func.isRequired,
        onError: PropTypes.func.isRequired
    };

    static defaultProps = {
        expression: [null, ""],
        placeholder: "write some math!"
    }

    componentWillMount() {
        this.componentWillReceiveProps(this.props);
    }

    componentWillReceiveProps(newProps) {
        // we only refresh our state if we had no previous state OR if our expression or table has changed
        if (!this.state || this.props.expression != newProps.expression || this.props.tableMetadata != newProps.tableMetadata) {
            let parsedExpression = newProps.expression;
            let expressionString = formatExpression(newProps.expression, this.props.tableMetadata.fields);
            let expressionErrorMessage = null;
            try {
                if (expressionString) {
                    parse(expressionString, { fields: newProps.tableMetadata.fields });
                }
            } catch (e) {
                expressionErrorMessage = e;
            }

            this.setState({
                parsedExpression,
                expressionString,
                expressionErrorMessage,
                suggestions:           [],
                highlightedSuggestion: 0,
                suggestionsTitle:      null
            });
        }
    }

    onSuggestionAccepted() {
        // let inputElement = ReactDOM.findDOMNode(this.refs.input),
        //     displayName  = this.state.suggestions[this.state.highlightedSuggestion].display_name,
        //     // wrap field names with spaces in them in quotes
        //     needsQuotes  = displayName.indexOf(' ') > -1,
        //     suggestion   = needsQuotes ? ('"' + displayName + '"') : displayName,
        //     tokenAtPoint = tokenAtPosition(this.state.tokens, inputElement.selectionStart);
        //
        // let expression = this.state.expressionString.substring(0, tokenAtPoint.start) + suggestion + this.state.expressionString.substring(tokenAtPoint.end, this.state.expressionString.length);
        //
        // // Remove extra quotation marks in case we accidentally inserted duplicates when accepting a suggestion already inside some
        // expression = expression.replace(/"+/, '"');
        //
        // // hand off to the code that deals with text change events which will trigger parsing and new autocomplete suggestions
        // inputElement.value = expression + ' ';
        // this.onInputChange(); // add a blank space after end of token
        //
        // this.setState({
        //     highlightedSuggestion: 0
        // });
    }

    onSuggestionMouseDown(event) {
        // when a suggestion is clicked, we'll highlight the clicked suggestion and then hand off to the same code that deals with ENTER / TAB keydowns
        event.preventDefault();

        this.setState({
            highlightedSuggestion: parseInt(event.target.getAttribute('data-i'))
        }, this.onSuggestionAccepted);
    }

    onInputKeyDown(event) {
        if (!this.state.suggestions.length) return;

        if (event.keyCode === KEYCODE_ENTER || event.keyCode === KEYCODE_TAB) {
            this.onSuggestionAccepted();

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

    onInputBlur() {
        this.setState({
            suggestions: [],
            highlightedSuggestion: 0,
            suggestionsTitle: null
        });

        // whenever our input blurs we push the updated expression to our parent if valid
        if (isExpression(this.state.parsedExpression)) this.props.onChange(this.state.parsedExpression)
            else if (this.state.expressionErrorMessage)    this.props.onError(this.state.expressionErrorMessage);
    }

    onInputChange() {
        let expressionString = ReactDOM.findDOMNode(this.refs.input).value;

        let expressionErrorMessage = null;
        let suggestions           = [];
        let suggestionsTitle      = null;
        let highlightedSuggestion = this.state.highlightedSuggestion;
        let parsedExpression;

        try {
            parsedExpression = parse(expressionString, { fields: this.props.tableMetadata.fields })
        } catch (e) {
            expressionErrorMessage = e;
        }

        if (expressionErrorMessage) console.error('expression error message:', expressionErrorMessage);

        this.setState({
            expressionErrorMessage,
            expressionString,
            parsedExpression,
            suggestions,
            suggestionsTitle,
            highlightedSuggestion
        });
    }

    render() {
        let errorMessage = this.state.expressionErrorMessage;
        if (errorMessage && !errorMessage.length) errorMessage = 'unknown error';

        const { placeholder } = this.props;

        console.log("error", this.state.expressionErrorMessage, "expression", this.state.parsedExpression)
        return (
            <div className={cx(S.editor, "relative")}>
                <input
                    ref="input"
                    className={cx(S.input, "my1 p1 input block full h4 text-dark", { "border-error": errorMessage })}
                    type="text"
                    placeholder={placeholder}
                    value={this.state.expressionString}
                    onChange={this.onInputChange}
                    onKeyDown={this.onInputKeyDown}
                    onBlur={this.onInputBlur}
                    onFocus={this.onInputChange}
                    focus={true}
                />
                <div className={cx(S.equalSign, "spread flex align-center h4 text-dark", { [S.placeholder]: !this.state.expressionString })}>=</div>
                {this.state.suggestions.length ?
                 <Popover
                     className="p2 not-rounded border-dark"
                     hasArrow={false}
                     tetherOptions={{
                             attachment: 'top left',
                             targetAttachment: 'bottom left',
                             targetOffset: '0 ' + ((this.state.expressionString.length / 2) * 6)
                         }}
                 >
                     <div style={{minWidth: 150, maxHeight: 342, overflow: "hidden"}}>
                         <h5 style={{marginBottom: 2}} className="h6 text-grey-2">{this.state.suggestionsTitle}</h5>
                         <ul>
                             {this.state.suggestions.map((suggestion, i) =>
                                 <li style={{paddingTop: "2px", paddingBottom: "2px", cursor: "pointer"}}
                                     className={cx({"text-bold text-brand": i === this.state.highlightedSuggestion})}
                                     data-i={i}
                                     onMouseDown={this.onSuggestionMouseDown}
                                 >
                                     {suggestion.display_name}
                                 </li>
                              )}
                         </ul>
                     </div>
                 </Popover>
                 : null}
            </div>
        );
    }
}
