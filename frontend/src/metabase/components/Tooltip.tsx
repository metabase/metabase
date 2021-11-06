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

type TooltipProps = {
  tooltip?: React.ReactNode;
  children?: JSX.Element;
  reference?: Element;
  isEnabled?: boolean;
  isOpen?: boolean;
  maxWidth?: string | number | undefined;
};

// specifically, checking for React elements like <div> that support refs
function isReactDOMTypeElement(element: any): element is JSX.Element {
  return ReactIs.isElement(element) && typeof element.type === "string";
}

// Tippy relies on child nodes forwarding refs, so when `children` is neither
// a DOM element or a forwardRef, we need to wrap it in a span.
function getSafeChildren(children: React.ReactNode) {
  if (isReactDOMTypeElement(children) || ReactIs.isForwardRef(children)) {
    return children;
  } else {
    return <span>{children}</span>;
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
  let visible;
  if (isEnabled === false) {
    visible = false;
  } else if (isOpen != null) {
    visible = isOpen;
  }

  const safeChildren = getSafeChildren(children);

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
    return children == null ? null : children;
  }
}

export default Tooltip;
