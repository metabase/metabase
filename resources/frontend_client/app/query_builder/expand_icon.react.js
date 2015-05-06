'use strict';

var ExpandIcon = React.createClass({
    getDefaultProps: function() {
        return {
            width: '32',
            height: '32',
            className: 'Icon-expand',
            id: 'expand',
            fill: 'currentcolor'
        };
      },

    render: function() {
        return (
            <svg {... this.props} viewBox="0 0 32 32">
                <path d="M16 4 L28 4 L28 16 L24 12 L20 16 L16 12 L20 8z M4 16 L8 20 L12 16 L16 20 L12 24 L16 28 L4 28z "></path>
            </svg>
        );
    }
});
