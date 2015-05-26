'use strict';

var Icon = React.createClass({
    displayName: 'Icon',
    propTypes: function () {

    },
    iconPaths: {
        check: 'M1 14 L5 10 L13 18 L27 4 L31 8 L13 26 z ',
    },
    getDefaultProps: function () {
       return {
          width: 32,
          height: 32,
          fill: 'currentcolor',
          iconClassName: 'Icon'
       };
    },
    render: function () {
        return (
            <svg viewbox="0 0 32 32" {... this.props}>
                <path d={this.iconPaths[this.props.name]}/>
            </svg>
        );
    }
});
