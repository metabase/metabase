"use strict";

import React, { Component, PropTypes } from "react";

import CheckBox from 'metabase/components/CheckBox.react';

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
            <ul className="px1 pt1" style={{maxHeight: '200px', overflowY: 'scroll'}}>
                {options.map((option, index) => {
                    return (
                        <li key={index}>
                            <label className="flex align-center full cursor-pointer p1" onClick={(e) => this.selectValue(option.key, !checked[option.key])}>
                                <CheckBox checked={checked[option.key]} />
                                <h4 className="ml1">{option.name}</h4>
                            </label>
                        </li>
                    )
                })}
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
