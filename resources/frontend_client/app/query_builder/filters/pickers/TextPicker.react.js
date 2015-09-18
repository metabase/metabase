"use strict";

import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.react";

export default class TextPicker extends Component {

    addValue() {
        let values = this.props.values.slice();
        values.push(null);
        this.props.setValues(values);
    }

    removeValue(index) {
        let values = this.props.values.slice();
        values.splice(index, 1);
        this.props.setValues(values);
    }

    setValue(index, value) {
        let values = this.props.values.slice();
        values[index] = value;
        this.props.setValues(values);
    }

    render() {
        let { values, multi } = this.props;

        if (values.length === 0) {
            values = values.concat(null);
        }

        return (
            <div>
                <ul>
                    {values.map((value, index) =>
                        <li className="px1 pt1 relative">
                            <input className="input block full border-purple" type="text" value={value} onChange={(e) => this.setValue(index, e.target.value)}/>
                            { index > 0 ?
                                <span className="absolute top right">
                                    <Icon name="close" className="cursor-pointer" width="16" height="16" onClick={() => this.removeValue(index)}/>
                                </span>
                            : null }
                        </li>
                    )}
                </ul>
                { multi ?
                    <div className="px1">
                        { values[values.length - 1] !== null ?
                            <a className="text-underline cursor-pointer" onClick={() => this.addValue()}>Add another value</a>
                        : null }
                    </div>
                : null }
            </div>
        );
    }
}

TextPicker.propTypes = {
    values: PropTypes.array.isRequired,
    setValues: PropTypes.func.isRequired,
    multi: PropTypes.bool,
    index: PropTypes.number
};
