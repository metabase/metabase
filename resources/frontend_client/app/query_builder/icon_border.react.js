'use strict';

var cx = React.addons.classSet;

var IconBorder = React.createClass({
    displayName: 'IconBorder',
    getDefaultProps: function () {
          return {
              rounded: true,
          }
    },
    computeSize: function () {
        var width = parseInt(this.props.children.props.width, 10);
        return width * 2;
    },
    render: function () {
        var classes = cx({
            'flex': true,
            'layout-centered': true
        });

        var styles = {
            width: this.computeSize(),
            height: this.computeSize(),
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: (this.props.children.props.fill),
            borderRadius: (this.props.rounded === true) ? '99px' : '0',
        }

        return (
            <span className={classes + ' ' + this.props.className} style={styles}>
                {this.props.children}
            </span>
        );
    }
});

export default IconBorder;
