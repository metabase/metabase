import type React from "react";
import { useEffect, useRef } from "react";
import { usePrevious } from "react-use";

import { HorizontalScrollBox } from "./NestedItemPicker.styled";

const gradualScroll = (container: HTMLDivElement | null) => {
  if (!container) {
    return;
  }
  const intervalId = setInterval(() => {
    // This is actually a fairly fussy check. It's possible for the scrollWidth to be higher
    // than what the scrollLeft + clientWidth can ever be, causing you to constantly scroll
    // right.
    if (
      container.scrollLeft + container.clientWidth <=
      container.scrollWidth * 0.99
    ) {
      container.scrollLeft += 25;
    } else {
      clearInterval(intervalId);
    }
  }, 10);
};

const scrollAllTheWay = (container: HTMLDivElement | null) => {
  if (!container) {
    return;
  }

  if (container.clientWidth < container.scrollWidth) {
    const diff = container.scrollWidth - container.clientWidth;
    container.scrollLeft += diff;
  }
};

export const AutoScrollBox = ({
  children,
  ...props
}: {
  children: React.ReactNode;
  props?: React.HTMLAttributes<HTMLDivElement>;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = containerRef.current?.scrollWidth;
  const previousContainerWidth = usePrevious(containerWidth);

  useEffect(() => {
    if (!containerWidth) {
      return;
    }

    if (!previousContainerWidth) {
      scrollAllTheWay(containerRef.current);
    } else if (containerWidth !== previousContainerWidth) {
      gradualScroll(containerRef.current);
    }
  }, [containerWidth, previousContainerWidth]);

  return (
    <HorizontalScrollBox h="100%" ref={containerRef} {...props}>
      {children}
    </HorizontalScrollBox>
  );
};
