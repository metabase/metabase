"use strict";

import React, { Component, PropTypes } from "react";

import TextPicker from "./TextPicker.react.js";

export default class NumberPicker extends Component {
    constructor(props) {
        super(props);
    }

    setValues(stringValues) {
        let values = stringValues.map(v => parseFloat(v))
        this.props.setValues(values);
        // let valid = values.map(v => !isNaN(v));
        // this.setState({ values: stringValues, valid: valid });
    }

    render() {
        return (
            <TextPicker
                {...this.props}
                setValues={(values) => this.setValues(values)}
            />
        );
    }
}

TextPicker.propTypes = {
    values: PropTypes.array.isRequired,
    setValues: PropTypes.func.isRequired,
    multi: PropTypes.bool,
    index: PropTypes.number
};
