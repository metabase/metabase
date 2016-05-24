import React, { Component, PropTypes } from 'react';
import cx from "classnames";
import _ from 'underscore';

import ParameterDateRangePicker from "./ParameterDateRangePicker.jsx";
import ParameterTextInputPicker from "./ParameterTextInputPicker.jsx";


export default class ParameterPicker extends Component {

    static propTypes = {
        parameter: PropTypes.object.isRequired,
        onChange: PropTypes.func.isRequired
    };

    determinePickerComponent(type) {
        switch(type) {
            case "date": return ParameterDateRangePicker;
            default:     return ParameterTextInputPicker;
        }
    }

    render() {
        const { parameter } = this.props;

        // determine the correct Picker to render based on the parameter data type
        const PickerComponent = this.determinePickerComponent(parameter.type);

        return (
            <PickerComponent {...this.props} />
        );
    }
}
