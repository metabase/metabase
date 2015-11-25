import React, { Component, PropTypes } from "react";

import Popover from "./Popover.jsx";

export default class Tooltip extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            isOpen: false
        };
    }

    static propTypes = {};
    static defaultProps = {};

    render() {
        let { tooltipElement } = this.props;
        return (
            <span
                onMouseEnter={() => this.setState({ isOpen: true })}
                onMouseLeave={() => this.setState({ isOpen: false })}
            >
                {this.props.children}
                <Popover
                    isOpen={this.state.isOpen}
                    className="PopoverBody--tooltip"
                    verticalAttachments={["bottom", "top"]}
                    targetOffsetY={10}
                >
                    { typeof tooltipElement === "string" ?
                        <div className="p2" style={{maxWidth: "12em"}}>{tooltipElement}</div>
                    :
                        {tooltipElement}
                    }
                </Popover>
            </span>
        );
    }
}
