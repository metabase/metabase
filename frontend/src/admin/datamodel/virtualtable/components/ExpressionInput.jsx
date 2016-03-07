import React, { Component, PropTypes } from "react";
import cx from "classnames";
import _ from "underscore";


export default class ExpressionInput extends Component {
    static propTypes = {
        autoFocus: PropTypes.bool,
        expression: PropTypes.string,
        placeholder: PropTypes.string,
        onBlur: PropTypes.func.isRequired
    };

    static defaultProps = {
        autoFocus: false,
        expression: null,
        placeholder: "= write your expression"
    };

    constructor(props, context) {
        super(props, context);

        this.state = {
            error: null,
            expression: props.expression || null,
        };
    }

    isValid() {
        const { expression } = this.state;
        return expression && !_.isEmpty(expression);
    }

    onBlur() {
        if (this.isValid()) {
            this.props.onBlur(this.state.expression);
        } else {
            // error handling
        }
    }

    render() {
        const { autoFocus, placeholder } = this.props;
        const { error, expression } = this.state;

        return (
            <input
                className={cx("input block full border-blue", {"border-error": error})}
                type="text"
                value={expression}
                onChange={(e) => this.setState({expression: e.target.value})}
                onBlur={this.onBlur.bind(this)}
                placeholder={placeholder}
                autoFocus={autoFocus}
            />
        );
    }
}
