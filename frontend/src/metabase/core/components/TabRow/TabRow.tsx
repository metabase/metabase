import { useState, useRef, useEffect } from "react";

import Icon from "metabase/components/Icon/Icon";
import ExplicitSize from "metabase/components/ExplicitSize";
import { TabListProps } from "../TabList/TabList";
import { ScrollButton, TabList } from "./TabRow.styled";

interface TabRowInnerProps<T> extends TabListProps<T> {
  width: number | null;
}
function TabRowInner<T>({
  width,
  onChange,
  children,
  ...props
}: TabRowInnerProps<T>) {
  const tabListRef = useRef<HTMLDivElement>(null);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [showScrollRight, setShowScrollRight] = useState(false);
  const showScrollLeft = scrollPosition > 0;

  useEffect(() => {
    if (!width || !tabListRef.current) {
      return;
    }

    setShowScrollRight(
      scrollPosition + width < tabListRef.current?.scrollWidth,
    );
  }, [children, scrollPosition, width]);

  const scroll = (direction: "left" | "right") => {
    if (!tabListRef.current || !width) {
      return;
    }

    const scrollDistance = width * (direction === "left" ? -1 : 1);
    tabListRef.current.scrollBy(scrollDistance, 0);
  };

  return (
    <TabList
      onChange={onChange as (value: unknown) => void}
      onScroll={event => setScrollPosition(event.currentTarget.scrollLeft)}
      ref={tabListRef}
      {...props}
    >
      {children}
      {showScrollLeft && (
        <ScrollArrow direction="left" onClick={() => scroll("left")} />
      )}
      {showScrollRight && (
        <ScrollArrow direction="right" onClick={() => scroll("right")} />
      )}
    </TabList>
  );
}

const TabRowInnerWithSize = ExplicitSize()(TabRowInner);
export function TabRow<T>(props: TabListProps<T>) {
  return <TabRowInnerWithSize {...props} />;
}

interface ScrollArrowProps {
  direction: "left" | "right";
  onClick: () => void;
}

export function ScrollArrow({ direction, onClick }: ScrollArrowProps) {
  return (
    <ScrollButton
      onClick={onClick}
      direction={direction}
      aria-label={`scroll tabs ${direction}`}
    >
      <Icon name={`chevron${direction}`} color="brand" />
    </ScrollButton>
  );
}
