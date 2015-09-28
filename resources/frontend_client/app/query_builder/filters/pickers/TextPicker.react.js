"use strict";

import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.react";
import cx from "classnames";

export default class TextPicker extends Component {

    addValue() {
        let values = this.props.values.slice();
        values.push(null);
        this.props.onValuesChange(values);
    }

    removeValue(index) {
        let values = this.props.values.slice();
        values.splice(index, 1);
        this.props.onValuesChange(values);
    }

    setValue(index, value) {
        let values = this.props.values.slice();
        values[index] = value;
        this.props.onValuesChange(values);
    }

    render() {
        let { values, validations, multi } = this.props;

        return (
            <div>
                <ul>
                    {values.map((value, index) =>
                        <li className="px1 pt1 relative">
                            <input
                                className={cx("input block full border-purple", { "border-error": validations[index] === false })}
                                type="text"
                                value={value}
                                onChange={(e) => this.setValue(index, e.target.value)}
                                autoFocus={true}
                            />
                            { index > 0 ?
                                <span className="absolute top right">
                                    <Icon name="close" className="cursor-pointer" width="16" height="16" onClick={() => this.removeValue(index)}/>
                                </span>
                            : null }
                        </li>
                    )}
                </ul>
                { multi ?
                    <div className="p1">
                        { values[values.length - 1] != null ?
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
    onValuesChange: PropTypes.func.isRequired,
    multi: PropTypes.bool,
    validations: PropTypes.array
};

TextPicker.defaultProps = {
    validations: []
}
