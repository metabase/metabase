import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";
import cx from "classnames";

export default class TextPicker extends Component {
    static propTypes = {
        values: PropTypes.array.isRequired,
        onValuesChange: PropTypes.func.isRequired,
        placeholder: PropTypes.string,
        validations: PropTypes.array,
        multi: PropTypes.bool
    };

    static defaultProps = {
        validations: [],
        placeholder: "Enter desired text"
    }

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
                        <li className="FilterInput px1 pt1 relative">
                            <input
                                className={cx("input block full border-purple", { "border-error": validations[index] === false })}
                                type="text"
                                value={value}
                                onChange={(e) => this.setValue(index, e.target.value)}
                                placeholder={this.props.placeholder}
                                autoFocus={true}
                            />
                            { index > 0 ?
                                <span className="FilterRemove-field absolute top right">
                                    <Icon name="close" className="cursor-pointer text-white" size={12} onClick={() => this.removeValue(index)}/>
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
