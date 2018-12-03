/*global ace*/

import React, { Component } from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";

import "ace/ace";
import "ace/mode-plain_text";
import "ace/mode-javascript";
import "ace/mode-json";

const SCROLL_MARGIN = 8;
const LINE_HEIGHT = 16;

export default class TextEditor extends Component {
  static propTypes = {
    mode: PropTypes.string,
    theme: PropTypes.string,
    value: PropTypes.string,
    defaultValue: PropTypes.string,
    onChange: PropTypes.func,
  };

  static defaultProps = {
    mode: "ace/mode/plain_text",
    theme: null,
  };

  componentWillReceiveProps(nextProps) {
    if (
      this._editor &&
      nextProps.value != null &&
      nextProps.value !== this._editor.getValue()
    ) {
      this._editor.setValue(nextProps.value);
      this._editor.clearSelection();
    }
  }

  _update() {
    let element = ReactDOM.findDOMNode(this);

    this._updateValue();

    this._editor.getSession().setMode(this.props.mode);
    this._editor.setTheme(this.props.theme);

    // read only
    this._editor.setReadOnly(this.props.readOnly);
    element.classList[this.props.readOnly ? "add" : "remove"]("read-only");

    this._updateSize();
  }

  _updateValue() {
    if (this._editor) {
      this.value = this._editor.getValue();
    }
  }

  _updateSize() {
    const doc = this._editor.getSession().getDocument();
    const element = ReactDOM.findDOMNode(this);
    element.style.height =
      2 * SCROLL_MARGIN + LINE_HEIGHT * doc.getLength() + "px";
    this._editor.resize();
  }

  onChange = e => {
    this._update();
    if (this.props.onChange) {
      this.props.onChange(this.value);
    }
  };

  componentDidMount() {
    let element = ReactDOM.findDOMNode(this);
    this._editor = ace.edit(element);

    window.editor = this._editor;

    // listen to onChange events
    this._editor.getSession().on("change", this.onChange);

    // misc options, copied from NativeQueryEditor
    this._editor.setOptions({
      enableBasicAutocompletion: true,
      enableSnippets: true,
      enableLiveAutocompletion: true,
      showPrintMargin: false,
      highlightActiveLine: false,
      highlightGutterLine: false,
      showLineNumbers: true,
      // wrap: true
    });
    this._editor.renderer.setScrollMargin(SCROLL_MARGIN, SCROLL_MARGIN);

    // initialize the content
    this._editor.setValue(
      (this.props.value != null ? this.props.value : this.props.defaultValue) ||
        "",
    );

    // clear the editor selection, otherwise we start with the whole editor selected
    this._editor.clearSelection();

    // hmmm, this could be dangerous
    // this._editor.focus();

    this._update();
  }

  componentDidUpdate() {
    this._update();
  }

  render() {
    const { className, style } = this.props;
    return <div className={className} style={style} />;
  }
}
