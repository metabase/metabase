'use strict';
/*global document, cx, PopoverContent, Tether*/

var PopoverWithTrigger = React.createClass({
    displayName: 'PopoverWithTrigger',

    getInitialState: function() {
        return {
            modalOpen: false
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
        this._tether.destroy();
        React.unmountComponentAtNode(this._popoverElement);
        if (this._popoverElement.parentNode) {
            this._popoverElement.parentNode.removeChild(this._popoverElement);
        }
        this._tether = undefined;
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
        return (
            <span>
                <a className="mx1" href="#" onClick={this.toggleModal}>
                    {this.props.triggerElement}
                </a>
            </span>
        );
    }
});