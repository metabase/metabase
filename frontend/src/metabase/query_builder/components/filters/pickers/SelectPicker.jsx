import React, { Component, PropTypes } from "react";

import CheckBox from 'metabase/components/CheckBox.jsx';

import { capitalize } from "metabase/lib/formatting";

import cx from "classnames";

export default class SelectPicker extends Component {
    static propTypes = {
        options: PropTypes.object.isRequired,
        values: PropTypes.array.isRequired,
        onValuesChange: PropTypes.func.isRequired,
        placeholder: PropTypes.string,
        multi: PropTypes.bool
    };

    selectValue(key, selected) {
        let values;
        if (this.props.multi) {
            values = this.props.values.slice().filter(v => v != null);
        } else {
            values = []
        }
        if (selected) {
            values.push(key);
        } else {
            values = values.filter(v => v !== key);
        }
        this.props.onValuesChange(values);
    }

    nameForOption(option) {
        if (option.name === "") {
            return "Empty";
        } else if (typeof option.name === "string") {
            return option.name;
        } else {
            return capitalize(String(option.name));
        }
    }

    render() {
        let { values, options, placeholder, multi } = this.props;

        let checked = {};
        for (let value of values) {
            checked[value] = true;
        }

        return (
            <div className="px1 pt1" style={{maxHeight: '400px', overflowY: 'scroll'}}>
                { placeholder ?
                    <h5>{placeholder}</h5>
                : null }
                { multi ?
                    <ul>
                        {options.map((option, index) =>
                            <li key={index}>
                                <label className="flex align-center cursor-pointer p1" onClick={() => this.selectValue(option.key, !checked[option.key])}>
                                    <CheckBox checked={checked[option.key]} />
                                    <h4 className="ml1">{this.nameForOption(option)}</h4>
                                </label>
                            </li>
                        )}
                    </ul>
                :
                    <div className="flex flex-wrap py1">
                        {options.map((option, index) =>
                            <div className="half" style={{ padding: "0.15em" }}>
                                <button
                                    style={{ height: "95px" }}
                                    className={cx("full rounded bordered border-purple text-centered text-bold", {
                                        "text-purple bg-white": values[0] !== option.key,
                                        "text-white bg-purple-light": values[0] === option.key
                                    })}
                                    onClick={() => this.selectValue(option.key, true)}
                                >
                                    {this.nameForOption(option)}
                                </button>
                            </div>
                        )}
                    </div>
                }

            </div>
        );
    }
}
