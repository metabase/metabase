/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";

export default class TextWidget extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            value: props.value
        };
    }

    static propTypes = {
        value: PropTypes.any,
        setValue: PropTypes.func.isRequired,
        className: PropTypes.string,
        isEditing: PropTypes.bool,
        commitImmediately: PropTypes.bool,
    };

    static defaultProps = {
        commitImmediately: false,
    };

    static noPopover = true;

    static format = (value) => value;

    componentWillReceiveProps(nextProps) {
        if (this.props.value !== nextProps.value) {
            this.setState({ value: nextProps.value });
        }
    }

    render() {
        const { setValue, className, isEditing } = this.props;
        return (
            <input
                className={className}
                type="text"
                value={this.state.value}
                onChange={(e) => {
                    this.setState({ value: e.target.value })
                    if (this.props.commitImmediately) {
                        this.props.setValue(e.target.value || null);
                    }
                }}
                onKeyUp={(e) => {
                    if (e.keyCode === 27) {
                        e.target.blur();
                    } else if (e.keyCode === 13) {
                        setValue(this.state.value || null);
                        e.target.blur();
                    }
                }}
                onBlur={() => this.setState({ value: this.props.value })}
                placeholder={isEditing ? "Enter a default value..." : "Enter a value..."}
            />
        );
    }
}
