import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";

import cx from "classnames";

export default React.createClass({
    displayName: 'ActionButton',
    propTypes: {
        actionFn: PropTypes.func.isRequired
    },

    getDefaultProps: function() {
        return {
            normalText: "Save",
            activeText: "Saving...",
            failedText: "Save failed",
            successText: "Saved",
            className: 'Button'
        };
    },

    getInitialState: function () {
        return {
            active: false,
            result: null
        };
    },

    resetStateOnTimeout: function() {
        // clear any previously set timeouts then start a new one
        clearTimeout(this.timeout);

        var component = this;
        this.timeout = setTimeout(function() {
            if (component.isMounted()) {
                component.replaceState(component.getInitialState());
            }
        }.bind(this), 5000);
    },

    onClick: function(event) {
        event.preventDefault();

        // set state to active
        this.setState({
            active: true,
            result: null
        });

        // run the function we want bound to this button
        var component = this;
        this.props.actionFn().then(function(success) {
            component.setState({
                active: false,
                result: "success"
            }, component.resetStateOnTimeout);
        }, function(error) {
            component.setState({
                active: false,
                result: "failed"
            }, component.resetStateOnTimeout);
        });

        // TODO: timeout on success/failed state to reset back to normal state
    },

    buttonContent: function() {
        if (this.state.active) {
            // TODO: loading spinner
            return this.props.activeText;
        } else if (this.state.result === "success") {
            return (
                <span>
                    <Icon name='check' width="12px" height="12px" />
                    <span className="ml1">{this.props.successText}</span>
                </span>
            );
        } else if (this.state.result === "failed") {
            return this.props.failedText;
        } else {
            return this.props.normalText;
        }
    },

    render: function() {
        var buttonStateClasses = cx({
            'Button--waiting': this.state.active,
            'Button--success': this.state.result === 'success',
            'Button--danger': this.state.result === 'failed'
        });

        return (
            <button className={this.props.className + ' ' + buttonStateClasses} onClick={this.onClick}>
                {this.buttonContent()}
            </button>
        );
    }
});
