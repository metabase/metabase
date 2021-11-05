import React from "react";
import PropTypes from "prop-types";
import Tippy from "@tippyjs/react";
import * as ReactIs from "react-is";

Tooltip.propTypes = {
  tooltip: PropTypes.node,
  children: PropTypes.node,
  reference: PropTypes.element,
  isEnabled: PropTypes.bool,
  isOpen: PropTypes.bool,
  maxWidth: PropTypes.number,
};

function isReactDOMTypeElement(element) {
  return ReactIs.isElement(element) && typeof element.type === "string";
}

function Tooltip({
  tooltip,
  children,
  reference,
  isEnabled,

  isOpen,
  maxWidth = 200,
}) {
  let visible;
  if (isEnabled === false) {
    visible = false;
  } else if (isOpen != null) {
    visible = isOpen;
  }

  // Tippy relies on child nodes forwarding refs, so when `children` is neither
  // a DOM element or a forwardRef, we need to wrap it in a span.
  let safeChildren;
  if (isReactDOMTypeElement(children) || ReactIs.isForwardRef(children)) {
    safeChildren = children;
  } else {
    safeChildren = <span>{children}</span>;
  }

  if (tooltip && reference) {
    return (
      <Tippy
        theme="tooltip"
        appendTo={() => document.body}
        content={tooltip}
        visible={visible}
        maxWidth={maxWidth}
        reference={reference}
      />
    );
  } else if (tooltip && safeChildren) {
    return (
      <Tippy
        theme="tooltip"
        appendTo={() => document.body}
        content={tooltip}
        visible={visible}
        maxWidth={maxWidth}
      >
        {safeChildren}
      </Tippy>
    );
  } else {
    return children ?? null;
  }
}

export default Tooltip;
