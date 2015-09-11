'use strict';

import React, { Component } from 'react';
import cx from "classnames";

export default class IconBorder extends Component {
    constructor() {
        super();
        this.state = {};
    }
    componentDidMount() {
        this.setState({
            childWidth: React.findDOMNode(this.refs.child).offsetWidth
        });
    }
    computeSize () {
        let width = parseInt(this.state.childWidth, 10);
        return width * 2;
    }

    render() {
        const classes = cx({
            'flex': true,
            'layout-centered': true
        });

        const styles = {
            width: this.computeSize(),
            height: this.computeSize(),
            borderWidth: this.props.borderWidth,
            borderStyle: this.props.borderStyle,
            borderColor: this.props.borderColor,
            lineHeight: '1px', /* HACK this is dumb but it centers the icon in the border */
        }

        if (this.props.borderRadius) {
            styles.borderRadius = this.props.borderRadius;
        } else if (this.props.rounded) {
            styles.borderRadius = "99px";
        }

        return (
            <span className={classes + ' ' + this.props.className} style={Object.assign(styles, this.props.style)}>
                <span ref="child">{this.props.children}</span>
            </span>
        );
    }
}

IconBorder.defaultProps = {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'currentcolor',
    rounded: true,
    style: {},
}
