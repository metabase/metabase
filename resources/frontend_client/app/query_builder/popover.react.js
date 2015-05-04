'use strict';
/*global cx, Tether*/

var Popover = React.createClass({
    displayName: 'Popover',

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
    },

    _popoverComponent: function() {
        var className = this.props.className;
        return (
            <div className={className}>
                {this.props.children}
            </div>
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
        React.render(this._popoverComponent(), this._popoverElement);

        var tetherOptions = (this.props.tetherOptions) ? this.props.tetherOptions : this._tetherOptions();

        // NOTE: these must be set here because they relate to OUR component and can't be passed in
        tetherOptions.element = this._popoverElement;
        tetherOptions.target = this.getDOMNode().parentElement;

        if (this._tether != null) {
            this._tether.setOptions(tetherOptions);
        } else {
            this._tether = new Tether(tetherOptions);
        }
    },

    render: function() {
        return <span/>;
    }
});