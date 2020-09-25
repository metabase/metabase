import React from "react";
import pure from "recompose/pure";

import Popover from "./Popover";

const TooltipPopover = ({ children, maxWidth, ...props }) => {
  let popoverContent;

  if (typeof children === "string") {
    popoverContent = <span>{children}</span>;
  } else {
    popoverContent = children;
  }

  return (
    <Popover
      className="PopoverBody--tooltip"
      targetOffsetY={10}
      hasArrow
      horizontalAttachments={["center", "left", "right"]}
      // OnClickOutsideWrapper is unecessary and causes existing popovers not to
      // be dismissed if a tooltip is visisble, so pass noOnClickOutsideWrapper
      noOnClickOutsideWrapper
      {...props}
    >
      {popoverContent}
    </Popover>
  );
};

export default pure(TooltipPopover);
