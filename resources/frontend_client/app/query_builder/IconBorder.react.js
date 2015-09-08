'use strict';

import cx from "classnames";

var IconBorder = React.createClass({
    displayName: 'IconBorder',
    getDefaultProps: function () {
          return {
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: 'currentcolor',
              rounded: true
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
            borderWidth: this.props.borderWidth,
            borderStyle: this.props.borderStyle,
            borderColor: this.props.borderColor
        }

        if (this.props.borderRadius) {
            styles.borderRadius = this.props.borderRadius;
        } else if (this.props.rounded) {
            styles.borderRadius = "99px";
        }

        return (
            <span className={classes + ' ' + this.props.className} style={styles}>
                {this.props.children}
            </span>
        );
    }
});

export default IconBorder;
