'use strict';
/*global document*/

import ModalContent from './ModalContent.react'

import Tether from 'tether';

export default React.createClass({
    displayName: 'Popover',

    getDefaultProps: function() {
        return {
            isOpen: true
        };
    },

    componentWillMount: function() {
        this._popoverElement = document.createElement('span');
        this._popoverElement.className = 'PopoverContainer';

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

    handleClickOutside: function() {
        if (this.props.onClose) {
            this.props.onClose()
        }
    },

    _popoverComponent: function() {
        return (
            <ModalContent handleClickOutside={this.handleClickOutside}>
                <div className={this.props.className}>
                    {this.props.children}
                </div>
            </ModalContent>
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
        if (this.props.isOpen) {
            // modal is open, lets do this!
            React.render(this._popoverComponent(), this._popoverElement);

            var tetherOptions = this.props.tetherOptions || this._tetherOptions();

            // NOTE: these must be set here because they relate to OUR component and can't be passed in
            tetherOptions.element = this._popoverElement;
            tetherOptions.target = this.getDOMNode().parentNode;

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
        return <span />;
    }
});
