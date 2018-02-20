import React from "react";

import OnClickOutsideWrapper from "metabase/components/OnClickOutsideWrapper";
import cx from "classnames";

/**
 * A modified version of TestPopover for Jest/Enzyme tests.
 * Simply renders the popover body inline instead of mutating DOM root.
 */
const TestPopover = props =>
  props.isOpen === undefined || props.isOpen ? (
    <OnClickOutsideWrapper
      handleDismissal={(...args) => {
        props.onClose && props.onClose(...args);
      }}
      dismissOnEscape={props.dismissOnEscape}
      dismissOnClickOutside={props.dismissOnClickOutside}
    >
      <div
        id={props.id}
        className={cx("TestPopover TestPopoverBody", props.className)}
        style={props.style}
        // because popover is normally directly attached to body element, other elements should not need
        // to care about clicks that happen inside the popover
        onClick={e => {
          e.stopPropagation();
        }}
      >
        {typeof props.children === "function"
          ? props.children({ maxHeight: 500 })
          : props.children}
      </div>
    </OnClickOutsideWrapper>
  ) : null;

export default TestPopover;
