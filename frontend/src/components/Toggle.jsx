import React, { Component, PropTypes } from "react";

import cx from "classnames";

export default class Toggle extends Component {
    constructor(props, context) {
        super(props, context);
        this.onClick = this.onClick.bind(this);
    }

    static propTypes = {
        value: PropTypes.bool.isRequired,
        onChange: PropTypes.func
    };

    onClick() {
        if (this.props.onChange) {
            this.props.onChange(!this.props.value);
        }
    }

    render() {
        return (
            <a
                className={cx("Toggle", "no-decoration", { selected: this.props.value }) + " " + (this.props.className||"")}
                style={{color: this.props.color || null}}
                onClick={this.onClick}
            />
        );
    }
}
