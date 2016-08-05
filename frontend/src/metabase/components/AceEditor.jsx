/*global ace*/

import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import "ace/ace";
import "ace/mode-plain_text";
import "ace/mode-javascript";
import "ace/mode-json";

export default class AceEditor extends Component {

    static propTypes = {
        mode: PropTypes.string,
        theme: PropTypes.string,
        value: PropTypes.string,
        defaultValue: PropTypes.string,
        onChange: PropTypes.func
    };

    static defaultProps = {
        mode: "ace/mode/plain_text",
        theme: null
    };

    componentWillReceiveProps(nextProps) {
        if (this._editor && nextProps.value != null && nextProps.value !== this._editor.getValue()) {
            this._editor.setValue(nextProps.value);
        }
    }

    _updateValue() {
        if (this._editor) {
            this.value = this._editor.getValue();
        }
    }

    onChange = (e) => {
        this._updateValue();
        if (this.props.onChange) {
            this.props.onChange(this.value);
        }
    }

    componentDidMount() {
        let element = ReactDOM.findDOMNode(this);
        this._editor = ace.edit(element);

        window.editor = this._editor;

        this._editor.getSession().setMode(this.props.mode);
        this._editor.setTheme(this.props.theme);
        this._editor.setShowPrintMargin(false);

        // listen to onChange events
        this._editor.getSession().on("change", this.onChange);

        // initialize the content
        this._editor.setValue((this.props.value != null ? this.props.value : this.props.defaultValue) || "");

        // clear the editor selection, otherwise we start with the whole editor selected
        this._editor.clearSelection();

        // hmmm, this could be dangerous
        this._editor.focus();

        this._updateValue();
    }

    componentDidUpdate() {
        this._updateValue();
        this._editor.getSession().setMode(this.props.mode);
        this._editor.setTheme(this.props.theme);
    }

    render() {
        const { className, style } = this.props
        return (
            <div className={className} style={style} />
        );
    }
}
