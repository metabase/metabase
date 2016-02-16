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
        isEnabled: PropTypes.bool,
        verticalAttachments: PropTypes.array
    };

    static defaultProps = {
        isEnabled: true,
        verticalAttachments: ["top", "bottom"]
    };

    render() {
        const { isEnabled, onMouseEnter, onMouseLeave, children } = this.props;
        const { isOpen } = this.state;
        const child = React.Children.only(children);
        return React.cloneElement(child, {
            onMouseEnter: (...args) => { this.setState({ isOpen: true }); onMouseEnter && onMouseEnter(...args); },
            onMouseLeave: (...args) => { this.setState({ isOpen: false }); onMouseLeave && onMouseLeave(...args); },
            children: React.Children.toArray(child.props.children).concat(
                isEnabled ? [<TooltipPopover isOpen={isOpen} {...this.props} children={this.props.tooltip} />] : []
            )
        });
    }
}
