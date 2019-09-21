import React from "react";
import cx from "classnames";
import pure from "recompose/pure";

import Popover from "./Popover";

// if the tooltip is passed a long description we'll want to conditionally
// format it to make it easier to read.
// we use the number of words as an approximation
const CONDITIONAL_WORD_COUNT = 10;

const wordCount = string => string.split(" ").length;

const TooltipPopover = ({ children, maxWidth, ...props }) => {
  let popoverContent;

  if (typeof children === "string") {
    const needsSpace = wordCount(children) > CONDITIONAL_WORD_COUNT;
    popoverContent = (
      <div
        className={cx({ "py1 px2": !needsSpace }, { "py2 px3": needsSpace })}
        style={{
          maxWidth: maxWidth || "12em",
          lineHeight: needsSpace ? 1.54 : 1,
        }}
      >
        {children}
      </div>
    );
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
