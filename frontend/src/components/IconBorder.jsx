import React, { Component, PropTypes, findDOMNode } from 'react';
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
        this.state = {};
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
            childWidth: findDOMNode(this.refs.child).offsetWidth
        });
    }
    computeSize () {
        let width = parseInt(this.state.childWidth, 10);
        return width * 2;
    }

    render() {
        const { borderWidth, borderStyle, borderColor, borderRadius, className, style, children } = this.props;

        const classes = {
            'flex': true,
            'layout-centered': true
        };
        classes[className] = true;

        const styles = {
            width: this.computeSize(),
            height: this.computeSize(),
            borderWidth: borderWidth,
            borderStyle: borderStyle,
            borderColor: borderColor,
            borderRadius: borderRadius,
            lineHeight: '1px', /* HACK this is dumb but it centers the icon in the border */
        }

        return (
            <span className={cx(classes)} style={Object.assign(styles, style)}>
                <span ref="child">{children}</span>
            </span>
        );
    }
}
