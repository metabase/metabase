import React, { Component, PropTypes } from "react";

import Popover from "./Popover.jsx";

export default class Tooltip extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            isOpen: false
        };
    }

    static propTypes = {
        tooltip: PropTypes.node.isRequired,
        children: PropTypes.element.isRequired
    };

    render() {
        let { tooltip, children } = this.props;
        let { isOpen } = this.state;

        let child = React.Children.only(children);
        return React.cloneElement(child, {
            onMouseEnter: () => this.setState({ isOpen: true }),
            onMouseLeave: () => this.setState({ isOpen: false }),
            children: React.Children.toArray(child.props.children).concat(
                <TooltipPopover isOpen={isOpen} tooltip={tooltip} />
            )
        });
    }
}

const TooltipPopover = ({ isOpen, tooltip }) =>
    <Popover
        isOpen={isOpen}
        className="PopoverBody--tooltip"
        verticalAttachments={["top", "bottom"]}
        targetOffsetY={10}
    >
        { typeof tooltip === "string" ?
            <div className="p2" style={{maxWidth: "12em"}}>
                {tooltip}
            </div>
        :
            tooltip
        }
    </Popover>
