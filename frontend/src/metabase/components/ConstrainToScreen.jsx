/* @flow */

import React, { Component } from "react";
import ReactDOM from "react-dom";

import { constrainToScreen } from "metabase/lib/dom";

type Props = {
    directions: Array<"top"|"bottom">,
    padding: number,
    children: React$Element<any>
};

export default class ConstrainToScreen extends Component<*, Props, *> {
    static defaultProps = {
        directions: ["top", "bottom"],
        padding: 10
    }

    componentDidMount() {
        this.componentDidUpdate();
    }

    componentDidUpdate() {
        const { directions, padding } = this.props;
        const element = ReactDOM.findDOMNode(this);
        for (const direction of directions) {
            constrainToScreen(element, direction, padding);
        }
    }

    render() {
        return React.Children.only(this.props.children);
    }
}
