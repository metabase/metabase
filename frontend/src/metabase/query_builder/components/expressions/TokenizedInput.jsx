import React, { Component, forwardRef } from "react";
import ReactDOM from "react-dom";
import ReactDOMServer from "react-dom/server";
import PropTypes from "prop-types";

import TokenizedExpression from "./TokenizedExpression";

import {
  getCaretPosition,
  saveSelection,
  getSelectionPosition,
} from "metabase/lib/dom";

class TokenizedInput extends Component {
  constructor(props) {
    super(props);
    this.state = {
      value: "",
    };
  }

  static defaultProps = {
    style: {},
    tokenizedEditing: false,
  };

  _getValue() {
    if (this.props.value != null) {
      return this.props.value;
    } else {
      return this.state.value;
    }
  }
  _setValue(value) {
    ReactDOM.findDOMNode(this).value = value;
    if (typeof this.props.onChange === "function") {
      this.props.onChange({ target: { value } });
    } else {
      this.setState({ value });
    }
  }

  componentDidMount() {
    ReactDOM.findDOMNode(this).focus();
    this.componentDidUpdate();

    document.addEventListener("selectionchange", this.onSelectionChange, false);
  }
  componentWillUnmount() {
    document.removeEventListener(
      "selectionchange",
      this.onSelectionChange,
      false,
    );
  }
  onSelectionChange = e => {
    ReactDOM.findDOMNode(this).selectionStart = getCaretPosition(
      ReactDOM.findDOMNode(this),
    );
  };
  onClick = e => {
    this._isTyping = false;
    return this.props.onClick(e);
  };
  onInput = e => {
    this._setValue(e.target.textContent);
  };

  onKeyDownNormal = e => {
    this.props.onKeyDown(e);
  };
  onKeyDownTokenized = e => {
    // isTyping signals whether the user is typing characters (keyCode >= 65) vs. deleting / navigating with arrows / clicking to select
    const isTyping = this._isTyping;
    // also keep isTyping same when deleting
    this._isTyping = e.keyCode >= 65 || (e.key === "Backspace" && isTyping);

    const input = ReactDOM.findDOMNode(this);

    const [start, end] = getSelectionPosition(input);
    if (start !== end) {
      return;
    }

    let element = window.getSelection().focusNode;
    while (element && element !== input) {
      // check ancestors of the focused node for "Expression-tokenized"
      // if the element is marked as "tokenized" we might want to intercept keypresses
      if (
        element.classList &&
        element.classList.contains("Expression-tokenized")
      ) {
        const positionInElement = getCaretPosition(element);
        const atStart = positionInElement === 0;
        const atEnd = positionInElement === element.textContent.length;
        const isSelected = element.classList.contains("Expression-selected");
        if (
          !isSelected &&
          !isTyping &&
          ((atEnd && e.key === "Backspace") || (atStart && e.key === "Delete"))
        ) {
          // not selected, not "typging", and hit backspace, so mark as "selected"
          element.classList.add("Expression-selected");
          e.stopPropagation();
          e.preventDefault();
          return;
        } else if (
          isSelected &&
          ((atEnd && e.key === "Backspace") || (atStart && e.key === "Delete"))
        ) {
          // selected and hit backspace, so delete it
          element.parentNode.removeChild(element);
          this._setValue(input.textContent);
          e.stopPropagation();
          e.preventDefault();
          return;
        } else if (
          isSelected &&
          ((atEnd && e.key === "ArrowLeft") ||
            (atStart && e.key === "ArrowRight"))
        ) {
          // selected and hit left arrow, so enter "typing" mode and unselect it
          element.classList.remove("Expression-selected");
          this._isTyping = true;
          e.stopPropagation();
          e.preventDefault();
          return;
        }
      }
      // nada, try the next ancestor
      element = element.parentNode;
    }

    // if we haven't handled the event yet, pass it on to our parent
    this.props.onKeyDown(e);
  };

  componentDidUpdate() {
    const inputNode = ReactDOM.findDOMNode(this);
    const restore = saveSelection(inputNode);

    inputNode.innerHTML = ReactDOMServer.renderToStaticMarkup(
      <TokenizedExpression
        source={this._getValue()}
        syntaxTree={this.props.syntaxTree}
        parserOptions={this.props.parserOptions}
      />,
    );

    if (document.activeElement === inputNode) {
      restore();
    }
  }

  render() {
    const { className, onFocus, onBlur, style, forwardedRef } = this.props;
    return (
      <div
        ref={forwardedRef}
        className={className}
        style={{ ...style }}
        contentEditable
        spellCheck={false}
        onKeyDown={
          this.props.tokenizedEditing
            ? this.onKeyDownTokenized
            : this.onKeyDownNormal
        }
        onInput={this.onInput}
        onFocus={onFocus}
        onBlur={onBlur}
        onClick={this.onClick}
      />
    );
  }
}

export default forwardRef(function TokenizedInputWithForwardedRef(props, ref) {
  return <TokenizedInput forwardedRef={ref} {...props} />;
});

TokenizedInput.propTypes = {
  className: PropTypes.string,
  forwardedRef: PropTypes.oneOfType([
    PropTypes.func,
    PropTypes.shape({ current: PropTypes.any }),
  ]),
  onBlur: PropTypes.func,
  onChange: PropTypes.func,
  onClick: PropTypes.func,
  onFocus: PropTypes.func,
  onKeyDown: PropTypes.func,
  parserOptions: PropTypes.object,
  style: PropTypes.object,
  syntaxTree: PropTypes.object,
  tokenizedEditing: PropTypes.bool,
  value: PropTypes.string,
};
