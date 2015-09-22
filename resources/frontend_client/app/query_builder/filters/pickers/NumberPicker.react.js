"use strict";

import React, { Component, PropTypes } from "react";

import TextPicker from "./TextPicker.react.js";

export default class NumberPicker extends Component {
    constructor(props) {
        super(props);
        this.state = {
            values: [],
            validations: []
        }
    }

    setValues(stringValues) {
        let values = stringValues.map(v => parseFloat(v))
        this.props.setValues(values.map(v => isNaN(v) ? null : v));
        let validations = values.map(v => !isNaN(v));
        this.setState({ values: stringValues, validations: validations });
    }

    render() {
        return (
            <TextPicker
                {...this.props}
                values={this.state.values}
                validations={this.state.validations}
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
