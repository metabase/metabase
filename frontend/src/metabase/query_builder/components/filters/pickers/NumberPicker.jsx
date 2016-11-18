import React, { Component, PropTypes } from "react";

import TextPicker from "./TextPicker.jsx";

export default class NumberPicker extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            values: props.values,
            validations: this._validate(props.values)
        }
    }

    static propTypes = {
        values: PropTypes.array.isRequired,
        onValuesChange: PropTypes.func.isRequired,
        placeholder: PropTypes.string,
        validations: PropTypes.array,
        multi: PropTypes.bool
    };

    static defaultProps = {
        placeholder: "Enter desired number"
    };

    _validate(values) {
        return values.map(v => v === undefined || !isNaN(v));
    }

    onValuesChange(stringValues) {
        let values = stringValues.map(v => parseFloat(v))
        this.props.onValuesChange(values.map(v => isNaN(v) ? null : v));
        this.setState({
            values: stringValues,
            validations: this._validate(values)
        });
    }

    render() {
        return (
            <TextPicker
                {...this.props}
                values={this.state.values.slice(0, this.props.values.length)}
                validations={this.state.validations}
                onValuesChange={(values) => this.onValuesChange(values)}
            />
        );
    }
}
