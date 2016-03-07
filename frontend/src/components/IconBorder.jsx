import React, { Component, PropTypes } from "react";
import cx from "classnames";
import Icon from 'metabase/components/Icon.jsx'

/*
Creates a bordered container for an <Icon /> component
based on the <Icon /> component's size.

usage:
    <IconBorder {...props} >
        <Icon name={chevrondown} width={12} height={12} />
    </IconBorder>
*/

export default class IconBorder extends Component {

    static propTypes = {
        borderWidth: PropTypes.string,
        borderStyle: PropTypes.string,
        borderColor: PropTypes.string,
        borderRadius: PropTypes.string,
        style: PropTypes.object,
        children: PropTypes.instanceOf(Icon)
    };

    static defaultProps = {
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'currentcolor',
        borderRadius: '99px',
        style: {},
    };

    render() {
        const { borderWidth, borderStyle, borderColor, borderRadius, className, style, children } = this.props;
        const size = parseInt(children.props.width, 10) * 2
        const styles = {
            width: size,
            height: size,
            borderWidth: borderWidth,
            borderStyle: borderStyle,
            borderColor: borderColor,
            borderRadius: borderRadius,
            ...style
        }

        return (
            <div className={cx('flex layout-centered', className)} style={styles}>
              {children}
            </div>
        );
    }
}
