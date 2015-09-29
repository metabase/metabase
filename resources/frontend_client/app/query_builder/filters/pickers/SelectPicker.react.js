"use strict";

import React, { Component, PropTypes } from "react";

import CheckBox from 'metabase/components/CheckBox.react';

export default class SelectPicker extends Component {
    selectValue(key, selected) {
        let values = this.props.values.slice().filter(v => v != null);
        if (selected) {
            values.push(key);
        } else {
            values = values.filter(v => v !== key);
        }
        this.props.onValuesChange(values);
    }

    render() {
        let { values, options, placeholder } = this.props;

        let checked = {};
        for (let value of values) {
            checked[value] = true;
        }

        return (
            <div className="px1 pt1" style={{maxHeight: '200px', overflowY: 'scroll'}}>
                { placeholder ?
                    <h5>{placeholder}</h5>
                : null }
                <ul>
                    {options.map((option, index) =>
                        <li key={index}>
                            <label className="flex align-center full cursor-pointer p1" onClick={(e) => this.selectValue(option.key, !checked[option.key])}>
                                <CheckBox checked={checked[option.key]} />
                                <h4 className="ml1">{option.name}</h4>
                            </label>
                        </li>
                    )}
                </ul>
            </div>
        );
    }
}

SelectPicker.propTypes = {
    options: PropTypes.object.isRequired,
    values: PropTypes.array.isRequired,
    onValuesChange: PropTypes.func.isRequired,
    placeholder: PropTypes.string,
    multi: PropTypes.bool
};
