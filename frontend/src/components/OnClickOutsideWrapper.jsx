import React, { Component, PropTypes } from "react";

import ClickOutComponent from 'react-onclickout';

// this feels a little silly, but we have this component ONLY so that we can add the OnClickOutside functionality on an
// arbitrary set of html content.  I wish we could do that more easily

// keep track of the order popovers were opened so we only close the last one when clicked outside
var popoverStack = [];

export default class OnClickOutsideWrapper extends ClickOutComponent {
    constructor(props, context) {
        super(props, context);
        this.state = this.state || {};
        this.state.ready = false;
    }

    componentWillMount() {
        popoverStack.push(this);
    }

    componentDidMount() {
        super.componentDidMount();
        // HACK: set the z-index of the parent element to ensure it's always on top
        React.findDOMNode(this).parentNode.style.zIndex = popoverStack.length + 2; // HACK: add 2 to ensure it's in front of main and nav elements
        // necessary to ignore click events that fire immediately, causing modals/popovers to close prematurely
        setTimeout(() => this.setState({ ready: true }), 10);
    }

    componentWillUnmount() {
        super.componentWillUnmount();
        // remove popover from the stack
        var index = popoverStack.indexOf(this);
        if (index >= 0) {
            popoverStack.splice(index, 1);
        }
    }

    onClickOut(...args) {
        // only propagate event for the popover on top of the stack
        if (this.state.ready && this === popoverStack[popoverStack.length - 1]) {
            this.props.handleClickOutside(...args);
        }
    }

    render() {
        return this.props.children;
    }
}
