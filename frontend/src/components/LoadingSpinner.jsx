import React, { Component, PropTypes } from "react";

export default class LoadingSpinner extends Component {
    static defaultProps = {
        width: '32px',
        height: '32px',
        borderWidth: '4px',
        fill: 'currentcolor',
        spinnerClassName: 'LoadingSpinner'
    };

    render() {
        var { width, height, borderWidth, className, spinnerClassName } = this.props;
        return (
            <div className={className}>
                <div className={spinnerClassName} style={{ width, height, borderWidth }}></div>
            </div>
        );
    }
}
