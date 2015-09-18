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
                        <li className="p1">
                            <input className="input block full" type="text" value={value} onChange={(e) => this.setValue(index, e.target.value)}/>
                            { index > 0 ?
                                <Icon name="close" className="cursor-pointer" width="16" height="16" onClick={() => this.removeValue(index)}/>
                            : null }
                        </li>
                    )}
                </ul>
                { multi ?
                    <div className="p1">
                        { values[values.length - 1] !== null ?
                            <a className="cursor-pointer" onClick={() => this.addValue()}>Add another value</a>
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
