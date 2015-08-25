"use strict";

import { Component } from "react";

import cx from "classnames";

// higher order component that takes a component which takes props "isOpen" and optionally "onClose"
// and returns a component that renders a <a> element "trigger", and tracks whether that component is open or not
export default ComposedComponent => class extends Component {
    constructor(props) {
        super(props);
        this.state = {
            isOpen: props.isInitiallyOpen || false,
            recentlyToggled: false
        }
    }

    open() {
        this.toggle(true);
    }

    close() {
        this.toggle(false);
    }

    toggle(isOpen = !this.state.isOpen) {
        if (!this.state.recentlyToggled) {
            this.setState({ isOpen, recentlyToggled: true });
            setTimeout(() => this.setState({ recentlyToggled: false }), 500);
        }
    }

    render() {
        return (
            <a href="#" onClick={() => this.toggle()} className={cx("no-decoration", this.props.triggerClasses)}>
                {this.props.triggerElement}
                <ComposedComponent
                    {...this.props}
                    isOpen={this.state.isOpen}
                    onClose={() => this.close()}
                />
            </a>
        );
    }
};
