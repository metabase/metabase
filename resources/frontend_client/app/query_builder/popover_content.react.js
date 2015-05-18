'use strict';
/*global cx, OnClickOutside, Popover, AddToDashboardPopover, SelectionModule, AddToDashIcon, ReactCSSTransitionGroup*/

// this feels a little silly, but we have this component ONLY so that we can add the OnClickOutside functionality on an
// arbitrary set of html content.  I wish we could do that more easily

var PopoverContent = React.createClass({
    displayName: 'PopoverContent',
    mixins: [OnClickOutside],

    handleClickOutside: function() {
    	this.props.handleClickOutside();
    },

    render: function() {
        return this.props.children;
    }
});
