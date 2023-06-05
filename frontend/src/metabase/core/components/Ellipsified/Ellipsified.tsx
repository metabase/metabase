import { useLayoutEffect, useRef, useState } from "react";
import * as React from "react";
// eslint-disable-next-line import/named
import { Placement } from "tippy.js";

import Tooltip from "metabase/core/components/Tooltip";
import resizeObserver from "metabase/lib/resize-observer";
import { EllipsifiedRoot } from "./Ellipsified.styled";

interface EllipsifiedProps {
  style?: React.CSSProperties;
  className?: string;
  showTooltip?: boolean;
  alwaysShowTooltip?: boolean;
  tooltip?: string;
  children?: React.ReactNode;
  tooltipMaxWidth?: React.CSSProperties["maxWidth"];
  lines?: number;
  placement?: Placement;
  "data-testid"?: string;
}

const Ellipsified = ({
  style,
  className,
  showTooltip = true,
  alwaysShowTooltip,
  tooltip,
  children,
  tooltipMaxWidth,
  lines,
  placement = "top",
  "data-testid": dataTestId,
}: EllipsifiedProps) => {
  const [isTruncated, setIsTruncated] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const element = rootRef.current;
    if (!element) {
      return;
    }
    const handleResize = () => {
      const isTruncated =
        element.scrollHeight > element.clientHeight ||
        element.offsetWidth < element.scrollWidth;
      setIsTruncated(isTruncated);
    };

    handleResize();
    resizeObserver.subscribe(element, handleResize);

    return () => resizeObserver.unsubscribe(element, handleResize);
  }, []);

  return (
    <Tooltip
      tooltip={tooltip || children || " "}
      isEnabled={(showTooltip && (isTruncated || alwaysShowTooltip)) || false}
      maxWidth={tooltipMaxWidth}
      placement={placement}
    >
      <EllipsifiedRoot
        ref={rootRef}
        className={className}
        lines={lines}
        style={style}
        data-testid={dataTestId}
      >
        {children}
      </EllipsifiedRoot>
    </Tooltip>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Ellipsified;
