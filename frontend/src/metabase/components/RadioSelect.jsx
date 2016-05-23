import React, { Component, PropTypes } from "react";

import cx from "classnames";

export default class RadioButtons extends Component {
    static propTypes = {
        value: PropTypes.any,
        options: PropTypes.array.isRequired,
        onChange: PropTypes.func,
        optionNameFn: PropTypes.func,
        optionValueFn: PropTypes.func,
        optionKeyFn: PropTypes.func
    };

    static defaultProps = {
        optionNameFn: (option) => option,
        optionValueFn: (option) => option,
        optionKeyFn: (option) => option
    };

    render() {
        var options = this.props.options.map((option) => {
            var name = this.props.optionNameFn(option);
            var value = this.props.optionNameFn(option);
            var key = this.props.optionKeyFn(option);
            var classes = cx("h3", "text-bold", "text-brand-hover", "no-decoration",  { "text-brand": this.props.value === value });
            return (
                <li className="mr3" key={key}>
                    <a className={classes} onClick={this.props.onChange.bind(null, value)}>{name}</a>
                </li>
            );
        });
        return <ul className="flex text-grey-4">{options}</ul>
    }
}
