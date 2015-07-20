'use strict';
/*global document, Tether*/

import PopoverContent from './popover_content.react'

export default React.createClass({
    displayName: 'PopoverWithTrigger',

    getInitialState: function() {
        // a selection module can be told to be open on initialization but otherwise is closed
        var isInitiallyOpen = this.props.isInitiallyOpen || false;
        return {
            modalOpen: isInitiallyOpen
        };
    },

    componentWillMount: function() {
        var popoverContainer = document.createElement('span');
        popoverContainer.className = 'PopoverContainer';

        this._popoverElement = popoverContainer;

        // TODO: we probably should put this somewhere other than body because then
        //       its outside our ng-view and could cause lots of issues
        document.querySelector('body').appendChild(this._popoverElement);
    },

    componentDidMount: function() {
        this._renderPopover();
    },

    componentDidUpdate: function() {
        this._renderPopover();
    },

    componentWillUnmount: function() {
        if (this._tether) {
            this._tether.destroy();
            this._tether = undefined;
        }
        React.unmountComponentAtNode(this._popoverElement);
        if (this._popoverElement.parentNode) {
            this._popoverElement.parentNode.removeChild(this._popoverElement);
        }
    },

    toggleModal: function() {
        var modalOpen = !this.state.modalOpen;
        this.setState({
            modalOpen: modalOpen
        });
    },

    _popoverComponent: function() {
        return (
            <PopoverContent handleClickOutside={this.toggleModal}>
                <div className={this.props.className}>
                    {this.props.children}
                </div>
            </PopoverContent>
        );
    },

    _tetherOptions: function() {
        // sensible defaults for most popovers
        return {
            attachment: 'bottom right',
            targetAttachment: 'top right',
            targetOffset: '10px 0',
            optimizations: {
                moveElement: false // always moves to <body> anyway!
            }
        };
    },

    _renderPopover: function() {
        if (this.state.modalOpen) {
            // modal is open, lets do this!
            React.render(this._popoverComponent(), this._popoverElement);

            var tetherOptions = (this.props.tetherOptions) ? this.props.tetherOptions : this._tetherOptions();

            // NOTE: these must be set here because they relate to OUR component and can't be passed in
            tetherOptions.element = this._popoverElement;
            tetherOptions.target = this.getDOMNode();

            if (this._tether !== undefined && this._tether !== null) {
                this._tether.setOptions(tetherOptions);
            } else {
                this._tether = new Tether(tetherOptions);
            }

        } else {
            // if the modal isn't open then actively unmount our popover
            React.unmountComponentAtNode(this._popoverElement);
        }
    },

    render: function() {
        var classes = "no-decoration ignore-react-onclickoutside";
        if (this.props.triggerClasses) {
            classes += " " + this.props.triggerClasses;
        }
        return (
            <span>
                <a className={classes} href="#" onClick={this.toggleModal}>
                    {this.props.triggerElement}
                </a>
            </span>
        );
    }
});
