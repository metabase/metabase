'use strict';
/*global cx, OnClickOutside, Popover, AddToDashboardPopover, SelectionModule, AddToDashIcon, ReactCSSTransitionGroup*/

var PopoverTrigger = React.createClass({
    displayName: 'PopoverTrigger',

    getInitialState: function() {
        return {
            modalOpen: false
        };
    },

    toggleModal: function() {
        var modalOpen = !this.state.modalOpen;
        this.setState({
            modalOpen: modalOpen
        });
    },

    renderPopover: function () {
        if(this.state.modalOpen) {
            return this.props.children;
        }
    },

    render: function() {
        return (
            <span>
                <a className="mx1" href="#" onClick={this.toggleModal}>
                    {this.props.button}
                </a>
                <ReactCSSTransitionGroup transitionName="Transition-popover">
                    {this.renderPopover()}
                </ReactCSSTransitionGroup>
            </span>
        );
    }
});
