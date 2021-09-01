/* eslint-disable react/prop-types */
import React from "react";
import pure from "recompose/pure";
import cx from "classnames";

import Popover from "./Popover";

const TooltipPopover = ({ children, constrainedWidth, ...props }) => {
  let popoverContent;

  if (typeof children === "string") {
    popoverContent = <span>{children}</span>;
  } else {
    popoverContent = children;
  }

  return (
    <Popover
      className={cx("PopoverBody--tooltip", {
        "PopoverBody--tooltipConstrainedWidth": constrainedWidth,
      })}
      targetOffsetY={10}
      hasArrow
      horizontalAttachments={["center", "left", "right"]}
      // OnClickOutsideWrapper is unecessary and causes existing popovers not to
      // be dismissed if a tooltip is visisble, so pass noOnClickOutsideWrapper
      noOnClickOutsideWrapper
      role="tooltip"
      {...props}
    >
      {popoverContent}
    </Popover>
  );
};

TooltipPopover.defaultProps = {
  // default to having a constrained toolip, which limits the width so longer strings wrap.
  constrainedWidth: true,
};

export default pure(TooltipPopover);
