import React, { Component, PropTypes } from "react";

import Popover from "./Popover.jsx";

const TooltipPopover = (props) =>
    <Popover
        className="PopoverBody--tooltip"
        targetOffsetY={10}
        {...props}
    >
        { typeof props.children === "string" ?
            <div className="py1 px2" style={{maxWidth: "12em"}}>
                {props.children}
            </div>
        :
            props.children
        }
    </Popover>

export default TooltipPopover;
