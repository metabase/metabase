import React, { useLayoutEffect, useRef, useState } from "react";

import Tooltip from "metabase/components/Tooltip";
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
  lines: number;
}

const Ellipsified = ({
  style,
  className,
  showTooltip = true,
  alwaysShowTooltip,
  tooltip,
  children,
  tooltipMaxWidth,
  lines = 1,
}: EllipsifiedProps) => {
  const [isTruncated, setIsTruncated] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const element = rootRef.current;
    if (!element) {
      return;
    }
    const handleResize = () => {
      setIsTruncated(element.offsetWidth < element.scrollWidth);
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
    >
      <EllipsifiedRoot
        ref={rootRef}
        className={className}
        lines={lines}
        style={style}
      >
        {children}
      </EllipsifiedRoot>
    </Tooltip>
  );
};

export default Ellipsified;
