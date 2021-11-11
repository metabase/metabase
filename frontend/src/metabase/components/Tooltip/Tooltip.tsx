import React from "react";
import PropTypes from "prop-types";
import Tippy from "@tippyjs/react";
import * as ReactIs from "react-is";

import { isReducedMotionPreferred } from "metabase/lib/dom";

Tooltip.propTypes = {
  tooltip: PropTypes.node,
  children: PropTypes.node,
  reference: PropTypes.instanceOf(Element),
  isEnabled: PropTypes.bool,
  isOpen: PropTypes.bool,
  maxWidth: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
};

type TooltipProps = {
  tooltip?: React.ReactNode;
  children?: React.ReactNode;
  reference?: Element;
  isEnabled?: boolean;
  isOpen?: boolean;
  maxWidth?: string | number | undefined;
};

// checking to see if the `element` is in JSX.IntrinisicElements since they support refs
// tippy's `children` prop seems to complain about anything more specific that React.ReactElement, unfortunately
function isReactDOMTypeElement(element: any): element is React.ReactElement {
  return ReactIs.isElement(element) && typeof element.type === "string";
}

// Tippy relies on child nodes forwarding refs, so when `children` is neither
// a DOM element or a forwardRef, we need to wrap it in a span.
function getSafeChildren(children: React.ReactNode) {
  if (isReactDOMTypeElement(children) || ReactIs.isForwardRef(children)) {
    return children;
  } else {
    return <span data-testid="tooltip-component-wrapper">{children}</span>;
  }
}

function Tooltip({
  tooltip,
  children,
  reference,
  isEnabled,
  isOpen,
  maxWidth = 200,
}: TooltipProps) {
  const visible = isOpen != null ? isOpen : undefined;
  const safeChildren = getSafeChildren(children);
  const animationDuration = isReducedMotionPreferred() ? 0 : undefined;

  if (tooltip && reference) {
    return (
      <Tippy
        theme="tooltip"
        appendTo={() => document.body}
        content={tooltip}
        visible={visible}
        disabled={isEnabled === false}
        maxWidth={maxWidth}
        reference={reference}
        duration={animationDuration}
      />
    );
  } else if (tooltip && children != null) {
    return (
      <Tippy
        theme="tooltip"
        appendTo={() => document.body}
        content={tooltip}
        visible={visible}
        disabled={isEnabled === false}
        maxWidth={maxWidth}
        duration={animationDuration}
      >
        {safeChildren}
      </Tippy>
    );
  } else {
    return <React.Fragment>{children}</React.Fragment>;
  }
}

export default Tooltip;
