import React, { Component, PropTypes } from "react";

export default class LoadingSpinner extends Component {
    static defaultProps = {
        width: '32px',
        height: '32px',
        fill: 'currentcolor',
        spinnerClass: 'Loading-indicator',
    };

    render() {
        var props = this.props;
        var animate = '<animateTransform attributeName="transform" type="rotate" from="0 16 16" to="360 16 16" dur="0.8s" repeatCount="indefinite" />';
        return (
            <div className={props.spinnerClass}>
                <svg viewBox="0 0 32 32" {...props}>
                  <path opacity=".25" d="M16 0 A16 16 0 0 0 16 32 A16 16 0 0 0 16 0 M16 4 A12 12 0 0 1 16 28 A12 12 0 0 1 16 4"/>
                  <path d="M16 0 A16 16 0 0 1 32 16 L28 16 A12 12 0 0 0 16 4z" dangerouslySetInnerHTML={{__html: animate}}></path>
                </svg>
            </div>
        );
    }
}
