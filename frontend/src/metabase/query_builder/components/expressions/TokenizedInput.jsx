import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import TokenizedExpression from "./TokenizedExpression.jsx";

import { getCaretPosition, saveSelection } from "metabase/lib/dom"

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
        let group;
        if (parent.classList.contains("close-paren") && parent.parentNode.classList.contains("group") && parent.parentNode.parentNode.classList.contains("aggregation")) {
            group = parent.parentNode.parentNode;
        } else if (parent.classList.contains("identifier")) {
            if (parent.parentNode.classList.contains("string-literal")) {
                group = parent.parentNode;
            } else {
                group = parent;
            }
        }

        if (group) {
            e.stopPropagation();
            e.preventDefault();
            if (group.classList.contains("selected")) {
                group.parentNode.removeChild(group);
                this._setValue(input.textContent);
            } else {
                group.classList.add("selected");
            }
        }
    }

    componentDidUpdate() {
        const inputNode = ReactDOM.findDOMNode(this);
        const restore = saveSelection(inputNode);

        ReactDOM.unmountComponentAtNode(inputNode);
        while (inputNode.firstChild) {
            inputNode.removeChild(inputNode.firstChild);
        }
        ReactDOM.render(<TokenizedExpression source={this._getValue()} />, inputNode);

        if (document.activeElement === inputNode) {
            restore();
        }
    }
    render() {
        const { className, onFocus, onBlur, onClick } = this.props;
        return (
            <div
                className={className}
                style={{ whiteSpace: "pre" }}
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
