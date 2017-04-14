import React, { Component } from "react";
import PropTypes from "prop-types";

import cx from "classnames";
import _ from "underscore";

export default class Radio extends Component {
    static propTypes = {
        value: PropTypes.any,
        options: PropTypes.array.isRequired,
        onChange: PropTypes.func,
        optionNameFn: PropTypes.func,
        optionValueFn: PropTypes.func,
        optionKeyFn: PropTypes.func,
        isVertical: PropTypes.bool,
        showButtons: PropTypes.bool,
    };

    static defaultProps = {
        optionNameFn: (option) => option.name,
        optionValueFn: (option) => option.value,
        optionKeyFn: (option) => option.value,
        isVertical: false
    };

    constructor(props, context) {
        super(props, context);
        this._id = _.uniqueId("radio-");
    }

    render() {
        const { value, options, onChange, optionNameFn, optionValueFn, optionKeyFn, isVertical, className } = this.props;
        // show buttons for vertical only by default
        const showButtons = this.props.showButtons != undefined ? this.props.showButtons : isVertical;
        return (
            <ul className={cx(className, "flex", { "flex-column": isVertical, "text-bold h3": !showButtons })}>
                {options.map(option =>
                    <li
                        key={optionKeyFn(option)}
                        className={cx("flex align-center cursor-pointer mt1 mr2", { "text-brand-hover": !showButtons })}
                        onClick={(e) => onChange(optionValueFn(option))}
                    >
                        <input
                            className="Form-radio"
                            type="radio"
                            name={this._id}
                            value={optionValueFn(option)}
                            checked={value === optionValueFn(option)}
                            id={this._id+"-"+optionKeyFn(option)}
                        />
                        { showButtons &&
                            <label htmlFor={this._id+"-"+optionKeyFn(option)} />
                        }
                        <span className={cx({ "text-brand": value === optionValueFn(option) })}>
                            {optionNameFn(option)}
                        </span>
                    </li>
                )}
            </ul>
        )
    }
}
