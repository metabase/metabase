import * as Tippy from "@tippyjs/react";
import PropTypes from "prop-types";
import { useMemo } from "react";
import * as React from "react";
import * as ReactIs from "react-is";

import { EMBEDDING_SDK_ROOT_ELEMENT_ID } from "embedding-sdk/config";
import { DEFAULT_Z_INDEX } from "metabase/components/Popover/constants";
import { isReducedMotionPreferred } from "metabase/lib/dom";
import { isReactDOMTypeElement } from "metabase-types/guards";

const TippyComponent = Tippy.default;

Tooltip.propTypes = {
  tooltip: PropTypes.node,
  children: PropTypes.node,
  reference: PropTypes.instanceOf(Element),
  placement: PropTypes.string,
  isEnabled: PropTypes.bool,
  isOpen: PropTypes.bool,
  isPadded: PropTypes.bool,
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
  isPadded?: boolean;
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

function appendTo() {
  return (
    document.getElementById(EMBEDDING_SDK_ROOT_ELEMENT_ID) || document.body
  );
}

/**
 * @deprecated: use Tooltip from "metabase/ui"
 */
function Tooltip({
  tooltip,
  children,
  delay,
  reference,
  placement,
  offset,
  isEnabled,
  isOpen,
  isPadded = true,
  preventOverflow = false,
  maxWidth = 300,
}: TooltipProps) {
  const visible = isOpen != null ? isOpen : undefined;
  const animationDuration = isReducedMotionPreferred() ? 0 : undefined;
  const disabled = isEnabled === false;
  const targetProps = getTargetProps(reference, children);

  const popperOptions = useMemo(
    () =>
      preventOverflow
        ? {
            modifiers: [
              {
                name: "preventOverflow",
                options: {
                  altAxis: true,
                },
              },
            ],
          }
        : undefined,
    [preventOverflow],
  );

  // themes styles come from frontend/src/metabase/components/Popover/Popover.css
  // Tippy theming API: https://atomiks.github.io/tippyjs/v6/themes/
  const theme = `tooltip ${isPadded ? "" : "no-padding"}`;

  if (tooltip && targetProps) {
    return (
      <TippyComponent
        theme={theme}
        className="popover"
        appendTo={appendTo}
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Tooltip;
