import React, { Component, PropTypes } from "react";

import TooltipPopover from "./TooltipPopover.jsx";

export default class Tooltip extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            isOpen: false
        };
    }

    static propTypes = {
        tooltip: PropTypes.node.isRequired,
        children: PropTypes.element.isRequired,
        verticalAttachments: PropTypes.array
    };

    static defaultProps = {
        verticalAttachments: ["top", "bottom"]
    };

    render() {
        const { onMouseEnter, onMouseLeave, children } = this.props;
        const child = React.Children.only(children);
        return React.cloneElement(child, {
            onMouseEnter: (...args) => { this.setState({ isOpen: true }); onMouseEnter && onMouseEnter(...args); },
            onMouseLeave: (...args) => { this.setState({ isOpen: false }); onMouseLeave && onMouseLeave(...args); },
            children: React.Children.toArray(child.props.children).concat(
                <TooltipPopover isOpen={this.state.isOpen} {...this.props} children={this.props.tooltip} />
            )
        });
    }
}
