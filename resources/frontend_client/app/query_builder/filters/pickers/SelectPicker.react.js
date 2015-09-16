"use strict";

import React, { Component, PropTypes } from "react";

export default class SelectPicker extends Component {
    selectValue(key, selected) {
        let values = this.props.values.slice();
        if (selected) {
            values.push(key);
        } else {
            values = values.filter(v => v !== key);
        }
        this.props.setValues(values);
    }

    render() {
        let { values, options } = this.props;

        let checked = {};
        for (let value of values) {
            checked[value] = true;
        }

        return (
            <ul>
                {options.map(option =>
                    <li>
                        <label>
                            <input type="checkbox" value={option.key} checked={checked[option.key]} onChange={(e) => this.selectValue(option.key, e.target.checked)}/>
                            {option.name}
                        </label>
                    </li>
                )}
            </ul>
        );
    }
}

SelectPicker.propTypes = {
    options: PropTypes.object.isRequired,
    values: PropTypes.array.isRequired,
    setValues: PropTypes.func.isRequired,
    multi: PropTypes.bool,
    index: PropTypes.number
};
