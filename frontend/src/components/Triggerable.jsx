import React, { Component, PropTypes } from "react";

import cx from "classnames";

// higher order component that takes a component which takes props "isOpen" and optionally "onClose"
// and returns a component that renders a <a> element "trigger", and tracks whether that component is open or not
export default ComposedComponent => class extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            isOpen: props.isInitiallyOpen || false
        }
    }

    open() {
        this.toggle(true);
    }

    close() {
        this.toggle(false);
    }

    toggle(isOpen = !this.state.isOpen) {
        this.setState({ isOpen });
    }

    onClose(e) {
        // don't close if clicked the actual trigger, it will toggle
        if (e && e.target && React.findDOMNode(this.refs.trigger).contains(e.target)) {
            return;
        }
        this.close();
    }

    getTriggerTarget() {
        if (this.props.getTriggerTarget) {
            return this.props.getTriggerTarget();
        } else {
            return this.refs.trigger;
        }
    }

    render() {
        return (
            <a ref="trigger" onClick={() => this.toggle()} className={cx("no-decoration", this.props.triggerClasses)}>
                {this.props.triggerElement}
                <ComposedComponent
                    {...this.props}
                    isOpen={this.state.isOpen}
                    onClose={this.onClose.bind(this)}
                    getTriggerTarget={() => this.getTriggerTarget()}
                />
            </a>
        );
    }
};
