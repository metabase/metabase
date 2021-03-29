import React, { Component } from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";

import * as ace from "ace-builds/src-noconflict/ace";

const SCROLL_MARGIN = 8;
const LINE_HEIGHT = 16;

export default class TextEditor extends Component {
  static propTypes = {
    mode: PropTypes.string,
    theme: PropTypes.string,
    value: PropTypes.string,
    defaultValue: PropTypes.string,
    onChange: PropTypes.func,
    onBlur: PropTypes.func,
    aceAutocomplete: PropTypes.bool,
    gutter: PropTypes.bool,
  };

  static defaultProps = {
    mode: "ace/mode/plain_text",
    theme: null,
    aceAutocomplete: true,
    gutter: true,
  };

  UNSAFE_componentWillReceiveProps(nextProps) {
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
    const element = ReactDOM.findDOMNode(this);

    if (this._editor == null) {
      return; // _editor is undefined when ace isn't loaded in tests
    }

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
    if (typeof ace === "undefined" || !ace || !ace.edit) {
      // fail gracefully-ish if ace isn't available, e.x. in integration tests
      return;
    }
    const element = ReactDOM.findDOMNode(this);
    this._editor = ace.edit(element);

    window.editor = this._editor;

    this._editor.getSession().on("change", this.onChange);

    // misc options, copied from NativeQueryEditor
    this._editor.setOptions({
      enableBasicAutocompletion: this.props.aceAutocomplete,
      enableSnippets: true,
      enableLiveAutocompletion: this.props.aceAutocomplete,
      showPrintMargin: false,
      highlightActiveLine: false,
      highlightGutterLine: false,
      showLineNumbers: true,
      // wrap: true
    });
    this._editor.renderer.setScrollMargin(SCROLL_MARGIN, SCROLL_MARGIN);
    this._editor.renderer.setShowGutter(this.props.gutter);

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
