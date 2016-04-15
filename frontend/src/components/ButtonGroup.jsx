import React, { Component, PropTypes } from "react";
import cx from "classnames";


export default class ButtonGroup extends Component {

    static defaultProps = {
        items: [],
        selectedItem: null,
        className: "",
        buttonClassName: "Button",
        buttonActiveClassName: "bg-brand text-white"
    };

    render() {
        const { items, selectedItem, className, buttonClassName, buttonActiveClassName } = this.props;

        return (
        	<ul className={cx("Button-group", className)}>
                {items.map((item, index) =>
                    <li key={"bgroup"+index} className={item.value === selectedItem ? cx(buttonClassName, buttonActiveClassName) : cx(buttonClassName)} onClick={this.props.onChange.bind(null, item)}>
                        {item.name}
                    </li>
                )}
            </ul>
        );
    }
}
