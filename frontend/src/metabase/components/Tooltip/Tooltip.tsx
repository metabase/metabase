import React, { useMemo } from "react";
import PropTypes from "prop-types";
import * as Tippy from "@tippyjs/react";
import * as ReactIs from "react-is";

import { isReducedMotionPreferred } from "metabase/lib/dom";
import { DEFAULT_Z_INDEX } from "metabase/components/Popover/constants";

const TippyComponent = Tippy.default;

Tooltip.propTypes = {
  tooltip: PropTypes.node,
  children: PropTypes.node,
  reference: PropTypes.instanceOf(Element),
  placement: PropTypes.string,
  isEnabled: PropTypes.bool,
  isOpen: PropTypes.bool,
  offset: PropTypes.oneOfType([PropTypes.array, PropTypes.func]),
  maxWidth: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
};

export interface TooltipProps
  extends Partial<
    Pick<
      Tippy.TippyProps,
      "delay" | "reference" | "placement" | "maxWidth" | "offset"
    >
  > {
  preventOverflow?: boolean;
  tooltip?: React.ReactNode;
  children?: React.ReactNode;
  isEnabled?: boolean;
  isOpen?: boolean;
  maxWidth?: string | number | undefined;
}

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

function getTargetProps(
  reference?: Element | React.RefObject<Element> | null,
  children?: React.ReactNode,
) {
  if (reference) {
    return { reference };
  } else if (children != null) {
    return { children: getSafeChildren(children) };
  }
}

function Tooltip({
  tooltip,
  children,
  delay,
  reference,
  placement,
  offset,
  isEnabled,
  isOpen,
  preventOverflow,
  maxWidth = 200,
}: TooltipProps) {
  const visible = isOpen != null ? isOpen : undefined;
  const animationDuration = isReducedMotionPreferred() ? 0 : undefined;
  const disabled = isEnabled === false;
  const targetProps = getTargetProps(reference, children);

  const popperOptions = useMemo(
    () => ({
      modifiers: [
        {
          name: "preventOverflow",
          enabled: preventOverflow,
          options: {
            altAxis: true,
          },
        },
      ],
    }),
    [preventOverflow],
  );

  if (tooltip && targetProps) {
    return (
      <TippyComponent
        theme="tooltip"
        className="popover"
        appendTo={() => document.body}
        content={tooltip}
        visible={visible}
        disabled={disabled}
        maxWidth={maxWidth}
        reference={reference}
        duration={animationDuration}
        delay={delay}
        placement={placement}
        offset={offset}
        zIndex={DEFAULT_Z_INDEX}
        popperOptions={popperOptions}
        {...targetProps}
      />
    );
  } else {
    return <React.Fragment>{children}</React.Fragment>;
  }
}

export default Tooltip;
