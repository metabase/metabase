import * as Tippy from "@tippyjs/react";
import cx from "classnames";
import { useMemo } from "react";
import * as React from "react";
import * as ReactIs from "react-is";

import { EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID } from "embedding-sdk/config";
import ZIndex from "metabase/css/core/z-index.module.css";
import { isReducedMotionPreferred } from "metabase/lib/dom";
import { isReactDOMTypeElement } from "metabase-types/guards";

const TippyComponent = Tippy.default;

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
  className?: string;
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
    document.getElementById(EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID) ||
    document.body
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
  className,
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

  const zIndex = "var(--mb-floating-element-z-index)" as unknown as number;

  if (tooltip && targetProps) {
    return (
      <TippyComponent
        theme={theme}
        className={cx("popover", ZIndex.FloatingElement, className)}
        zIndex={zIndex}
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
