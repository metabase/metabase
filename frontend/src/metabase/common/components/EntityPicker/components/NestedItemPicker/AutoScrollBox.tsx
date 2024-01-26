import { useEffect, useRef } from "react";
import { usePrevious } from "react-use";
import { HorizontalScrollBox } from "./NestedItemPicker.styled"

const gradualScroll = (container: HTMLDivElement | null) => {
  if (!container) {
    return;
  }
  const intervalId = setInterval(() => {
    if (container.scrollLeft + container.clientWidth < container.scrollWidth) {
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
}

export const AutoScrollBox = ({ children }: { children: React.ReactNode}) => {
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
    <HorizontalScrollBox h="100%" ref={containerRef}>
      {children}
    </HorizontalScrollBox>
  );
}
