import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import cx from "classnames";

/*
Creates a bordered container for an <Icon /> component
based on the <Icon /> component's size.

usage:
    <IconBorder {...props} >
        <Icon name={chevrondown} width={12} height={12} />
    </IconBorder>
*/

export default class IconBorder extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            childWidth: 0
        };
    }

    static propTypes = {
        borderWidth: PropTypes.string,
        borderStyle: PropTypes.string,
        borderColor: PropTypes.string,
        borderRadius: PropTypes.string,
        style: PropTypes.object,
    };

    static defaultProps = {
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'currentcolor',
        borderRadius: '99px',
        style: {},
    };

    componentDidMount() {
        this.setState({
            childWidth: ReactDOM.findDOMNode(this.refs.child).offsetWidth
        });
    }

    render() {
        const { borderWidth, borderStyle, borderColor, borderRadius, className, style, children } = this.props;
        const width = this.state.childWidth;
        const styles = {
            width: width * 2,
            height: width * 2,
            borderWidth: borderWidth,
            borderStyle: borderStyle,
            borderColor: borderColor,
            borderRadius: borderRadius,
            lineHeight: '1px', /* HACK this is dumb but it centers the icon in the border */
            ...style
        }

        return (
            <span className={cx("flex layout-centered", className)} style={styles}>
                <span ref="child">{children}</span>
            </span>
        );
    }
}
