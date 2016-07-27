import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";

import { cancelable } from "metabase/lib/promise";

import cx from "classnames";
import _ from "underscore";

export default class ActionButton extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            active: false,
            result: null
        };

        _.bindAll(this, "onClick", "resetStateOnTimeout")
    }

    static propTypes = {
        actionFn: PropTypes.func.isRequired
    };

    static defaultProps = {
        className: "Button",
        normalText: "Save",
        activeText: "Saving...",
        failedText: "Save failed",
        successText: "Saved"
    };

    componentWillUnmount() {
        clearTimeout(this.timeout);
        if (this.actionPromise) {
            this.actionPromise.cancel();
        }
    }

    resetStateOnTimeout() {
        // clear any previously set timeouts then start a new one
        clearTimeout(this.timeout);
        this.timeout = setTimeout(() => this.setState({
            active: false,
            result: null
        }), 5000);
    }

    onClick(event) {
        event.preventDefault();

        // set state to active
        this.setState({
            active: true,
            result: null
        });

        // run the function we want bound to this button
        this.actionPromise = cancelable(this.props.actionFn());
        this.actionPromise.then((success) => {
            this.setState({
                active: false,
                result: "success"
            }, this.resetStateOnTimeout);
        }, (error) => {
            if (!error.isCanceled) {
                console.error(error);
                this.setState({
                    active: false,
                    result: "failed"
                }, this.resetStateOnTimeout);
            }
        });
    }

    render() {
        var buttonStateClasses = cx(this.props.className, {
            'Button--waiting': this.state.active,
            'Button--success': this.state.result === 'success',
            'Button--danger': this.state.result === 'failed'
        });

        return (
            <button className={buttonStateClasses} onClick={this.onClick}>
                { this.state.active ?
                    // TODO: loading spinner
                    this.props.activeText
                : this.state.result === "success" ?
                    <span>
                        <Icon name='check' size={12} />
                        <span className="ml1">{this.props.successText}</span>
                    </span>
                : this.state.result === "failed" ?
                    this.props.failedText
                :
                    this.props.normalText
                }
            </button>
        );
    }
}
