import React, {
  forwardRef,
  HTMLAttributes,
  ReactNode,
  Ref,
  useContext,
  useMemo,
  useState,
  useEffect,
  useRef,
} from "react";
import Icon from "metabase/components/Icon";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import { TabContext, TabContextType } from "../Tab";
import { TabListContent, TabListRoot, ScrollButton } from "./TabList.styled";

const UNDERSCROLL_PIXELS = 32;

export interface TabListProps<T>
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  value?: T;
  onChange?: (value: T) => void;
  children?: ReactNode;
}

const TabList = forwardRef(function TabGroup<T>(
  { value, onChange, children, ...props }: TabListProps<T>,
  ref: Ref<HTMLDivElement>,
) {
  const idPrefix = useUniqueId();
  const outerContext = useContext(TabContext);

  const [scrollPosition, setScrollPosition] = useState(0);
  const [showScrollRight, setShowScrollRight] = useState(false);

  const tabListContentRef = useRef(null);

  const innerContext = useMemo(() => {
    return { value, idPrefix, onChange };
  }, [value, idPrefix, onChange]);

  const activeContext = outerContext.isDefault ? innerContext : outerContext;

  const scroll = (direction: string) => {
    if (tabListContentRef.current) {
      const container = tabListContentRef.current as HTMLDivElement;

      const scrollDistance =
        (container.offsetWidth - UNDERSCROLL_PIXELS) *
        (direction === "left" ? -1 : 1);
      container.scrollBy(scrollDistance, 0);
      setScrollPosition(container.scrollLeft + scrollDistance);
    }
  };

  const showScrollLeft = scrollPosition > 0;

  useEffect(() => {
    if (!tabListContentRef.current) {
      return;
    }

    const container = tabListContentRef.current as HTMLDivElement;
    setShowScrollRight(
      scrollPosition + container.offsetWidth < container.scrollWidth,
    );
  }, [scrollPosition]);

  return (
    <TabListRoot {...props} ref={ref} role="tablist">
      <TabListContent ref={tabListContentRef}>
        <TabContext.Provider value={activeContext as TabContextType}>
          {children}
        </TabContext.Provider>
      </TabListContent>
      {showScrollLeft && (
        <ScrollArrow direction="left" onClick={() => scroll("left")} />
      )}
      {showScrollRight && (
        <ScrollArrow direction="right" onClick={() => scroll("right")} />
      )}
    </TabListRoot>
  );
});

interface ScrollArrowProps {
  direction: "left" | "right";
  onClick: () => void;
}

const ScrollArrow = ({ direction, onClick }: ScrollArrowProps) => (
  <ScrollButton
    onClick={onClick}
    directionIcon={direction}
    aria-label={`scroll-${direction}-button`}
  >
    <Icon name={`chevron${direction}`} color="brand" />
  </ScrollButton>
);

export default TabList;
