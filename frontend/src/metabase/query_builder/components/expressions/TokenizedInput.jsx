import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import TokenizedExpression from "./TokenizedExpression.jsx";

import { getCaretPosition, saveCaretPosition } from "metabase/lib/dom"

export default class TokenizedInput extends Component {
    constructor(props) {
        super(props);
        this.state = {
            value: ""
        }
    }

    _getValue() {
        if (this.props.value != undefined) {
            return this.props.value;
        } else {
            return this.state.value;
        }
    }
    _setValue(value) {
        ReactDOM.findDOMNode(this).value = value;
        if (typeof this.props.onChange === "function") {
            this.props.onChange({ target: { value }});
        } else {
            this.setState({ value });
        }
    }

    componentDidMount() {
        ReactDOM.findDOMNode(this).focus();
        this.componentDidUpdate()

        document.addEventListener("selectionchange", this.onSelectionChange, false);
    }
    componentWillUnmount() {
        document.removeEventListener("selectionchange", this.onSelectionChange, false);
    }
    onSelectionChange = (e) => {
        ReactDOM.findDOMNode(this).selectionStart = getCaretPosition(ReactDOM.findDOMNode(this))
    }
    onInput = (e) => {
        this._setValue(e.target.textContent);
    }
    onKeyDown = (e) => {
        this.props.onKeyDown(e);

        // handle tokenized delete
        if (e.keyCode !== 8) {
            return;
        }
        const input = ReactDOM.findDOMNode(this);

        var selection = window.getSelection();
        var range = selection.getRangeAt(0);

        let isEndOfNode = range.endContainer.length === range.endOffset;
        let hasSelection = range.startContainer !== range.endContainer || range.startOffset !== range.endOffset;

        let el = selection.focusNode;
        let path = [];
        while (el && el != input) {
            path.unshift(el.className);
            el = el.parentNode;
        }

        /*
        e.stopPropagation();
        e.preventDefault();
        return;
        /**/

        if (!isEndOfNode || hasSelection) {
            return;
        }

        let parent = selection.focusNode.parentNode;
        if (parent.className === "close-paren" && parent.parentNode.className === "group" && parent.parentNode.parentNode.className === "aggregation") {
            parent.parentNode.parentNode.parentNode.removeChild(parent.parentNode.parentNode);
            e.stopPropagation();
            e.preventDefault();
            this._setValue(input.textContent);
        } else if (parent.className === "identifier") {
            if (parent.parentNode.className === "string-literal") {
                parent.parentNode.parentNode.removeChild(parent.parentNode);
            } else {
                parent.parentNode.removeChild(parent);
            }
            e.stopPropagation();
            e.preventDefault();
            this._setValue(input.textContent);
        }
    }

    componentDidUpdate() {
        const inputNode = ReactDOM.findDOMNode(this);
        const restore = saveCaretPosition(inputNode);

        ReactDOM.unmountComponentAtNode(inputNode);
        while (inputNode.firstChild) {
            inputNode.removeChild(inputNode.firstChild);
        }
        ReactDOM.render(<TokenizedExpression source={this._getValue()} />, inputNode);
        restore();
    }
    render() {
        const { className, onFocus, onBlur, onClick } = this.props;
        return (
            <div
                className={className}
                contentEditable
                onKeyDown={this.onKeyDown}
                onInput={this.onInput}
                onFocus={onFocus}
                onBlur={onBlur}
                onClick={onClick}
            />
        );
    }
}
