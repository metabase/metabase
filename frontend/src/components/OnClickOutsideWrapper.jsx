import React, { Component, PropTypes } from "react";

import OnClickOutside from 'react-onclickoutside';

// this feels a little silly, but we have this component ONLY so that we can add the OnClickOutside functionality on an
// arbitrary set of html content.  I wish we could do that more easily

// keep track of the order popovers were opened so we only close the last one when clicked outside
var popoverStack = [];

export default React.createClass({
    displayName: 'OnClickOutsideWrapper',
    mixins: [OnClickOutside],

    componentWillMount: function() {
        popoverStack.push(this);
    },

    componentDidMount: function() {
        // HACK: set the z-index of the parent element to ensure it's always on top
        React.findDOMNode(this).parentNode.style.zIndex = popoverStack.length + 2; // HACK: add 2 to ensure it's in front of main and nav elements
    },

    componentWillUnmount: function() {
        // remove popover from the stack
        var index = popoverStack.indexOf(this);
        if (index >= 0) {
            popoverStack.splice(index, 1);
        }
    },

    handleClickOutside: function(...args) {
        // only propagate event for the popover on top of the stack
        if (this === popoverStack[popoverStack.length - 1]) {
            this.props.handleClickOutside(...args);
        }
    },

    render: function() {
        return this.props.children;
    }
});
