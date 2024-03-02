/*global ace*/
import PropTypes from "prop-types";
import { Component, createRef } from "react";

import "ace/ace";
import "ace/mode-plain_text";
import "ace/mode-javascript";
import "ace/mode-json";
import { TextEditorRoot } from "./TextEditor.styled";

const SCROLL_MARGIN = 8;
const LINE_HEIGHT = 16;
const HIGHLIGHTED_CODE_ROW_CLASSNAME = "highlighted-code-marker";
const HIGHLIGHTED_CODE_ROW_NUMBER_CLASSNAME =
  "highlighted-code-marker-row-number";

export default class TextEditor extends Component {
  static propTypes = {
    mode: PropTypes.string,
    theme: PropTypes.string,
    value: PropTypes.string,
    defaultValue: PropTypes.string,
    readOnly: PropTypes.bool,
    highlightedTexts: PropTypes.arrayOf(PropTypes.string),
    onChange: PropTypes.func,
    className: PropTypes.string,
  };

  static defaultProps = {
    mode: "ace/mode/plain_text",
    theme: null,
  };

  editorRef = createRef();

  highlightedTextMarkerIds = [];

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
    const element = this.editorRef.current;

    if (this._editor == null) {
      return; // _editor is undefined when ace isn't loaded in tests
    }

    this._updateValue();

    this._editor.getSession().setMode(this.props.mode);
    this._editor.setTheme(this.props.theme);

    this._editor.setReadOnly(this.props.readOnly);
    element.classList[this.props.readOnly ? "add" : "remove"]("read-only");

    this._removeTextHighlight();
    const { highlightedTexts } = this.props;
    if (highlightedTexts != null) {
      highlightedTexts.forEach(this._addTextHighlight);
    }

    this._updateSize();
  }

  _updateValue() {
    if (this._editor) {
      this.value = this._editor.getValue();
    }
  }

  _updateSize() {
    const doc = this._editor.getSession().getDocument();
    const element = this.editorRef.current;
    element.style.height =
      2 * SCROLL_MARGIN + LINE_HEIGHT * doc.getLength() + "px";
    this._editor.resize();
  }

  _addTextHighlight = textToHighlight => {
    const textRange = this._editor.find(textToHighlight);
    this._editor.selection.clearSelection();

    if (textRange) {
      const highlightedTextMarkerId = this._editor.session.addMarker(
        textRange,
        HIGHLIGHTED_CODE_ROW_CLASSNAME,
        "fullLine",
        true,
      );
      this.highlightedTextMarkerIds.push(highlightedTextMarkerId);

      for (let i = textRange.start.row; i <= textRange.end.row; i++) {
        this._editor.session.addGutterDecoration(
          i,
          HIGHLIGHTED_CODE_ROW_NUMBER_CLASSNAME,
        );
      }
    }
  };

  _removeTextHighlight() {
    this.highlightedTextMarkerIds.forEach(highlightedTextMarkerId => {
      this._editor.session.removeMarker(highlightedTextMarkerId);
    });
    this.highlightedTextMarkerIds = [];

    for (let i = 0; i <= this._editor.session.getLength(); i++) {
      this._editor.session.removeGutterDecoration(
        i,
        HIGHLIGHTED_CODE_ROW_NUMBER_CLASSNAME,
      );
    }
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

    const element = this.editorRef.current;
    this._editor = ace.edit(element);

    window.editor = this._editor;

    // listen to onChange events
    this._editor.getSession().on("change", this.onChange);

    // misc options, copied from NativeQueryEditor
    this._editor.setOptions({
      showPrintMargin: false,
      highlightActiveLine: false,
      highlightGutterLine: false,
      showLineNumbers: true,
      showFoldWidgets: false,
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
    const { className } = this.props;

    return <TextEditorRoot ref={this.editorRef} className={className} />;
  }
}
