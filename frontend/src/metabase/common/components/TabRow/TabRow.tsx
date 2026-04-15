import {
  DndContext,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  restrictToHorizontalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useMergedRef } from "@mantine/hooks";
import cx from "classnames";
import {
  type ReactNode,
  type Ref,
  forwardRef,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { usePreviousDistinct } from "react-use";

import { ExplicitSize } from "metabase/common/components/ExplicitSize";
import { useDndSensors } from "metabase/common/hooks";
import { Icon } from "metabase/ui";

import type { TabListProps } from "../TabList/TabList";

import { ScrollButton, TabList } from "./TabRow.styled";
import { tabsCollisionDetection } from "./collision-detection";

interface TabRowProps<T> extends TabListProps<T> {
  width?: number | null;
  itemIds?: UniqueIdentifier[];
  handleDragEnd?: (
    activeId: UniqueIdentifier,
    overId: UniqueIdentifier,
  ) => void;
}

const TabRowInner = forwardRef<HTMLDivElement, TabRowProps<unknown>>(
  function TabRowInner<T>(
    {
      width,
      onChange,
      children,
      itemIds,
      handleDragEnd,
      ...props
    }: TabRowProps<T>,
    ref: Ref<HTMLDivElement>,
  ) {
    const tabListRef = useRef<HTMLDivElement>(null);
    const mergedRef = useMergedRef(tabListRef, ref);

    const [scrollPosition, setScrollPosition] = useState(0);
    const [showScrollRight, setShowScrollRight] = useState(false);
    const showScrollLeft = scrollPosition > 0;

    const itemsCount = itemIds?.length ?? 0;
    const previousItemsCount = usePreviousDistinct(itemsCount) ?? 0;

    const sensors = useDndSensors({ distance: 10 });

    const scroll = useCallback(
      (direction: "left" | "right") => {
        if (!tabListRef.current || !width) {
          return;
        }
        const left = width * (direction === "left" ? -1 : 1);
        tabListRef.current.scrollBy?.({ left, behavior: "instant" });
      },
      [width],
    );

    useLayoutEffect(() => {
      if (itemsCount - previousItemsCount === 1) {
        scroll("right");
      }
    }, [itemsCount, previousItemsCount, scroll]);

    useLayoutEffect(() => {
      if (!width || !tabListRef.current) {
        return;
      }

      setShowScrollRight(
        Math.round(scrollPosition + width) < tabListRef.current?.scrollWidth,
      );
    }, [scrollPosition, width]);

    const onDragEnd = (event: DragEndEvent) => {
      if (!event.over || !handleDragEnd) {
        return;
      }
      handleDragEnd(event.active.id, event.over.id);
    };

    return (
      <TabList
        onChange={onChange as (value: unknown) => void}
        onScroll={(event) => setScrollPosition(event.currentTarget.scrollLeft)}
        ref={mergedRef}
        {...props}
        className={cx(
          {
            scrollable: showScrollLeft || showScrollRight,
          },
          props.className,
        )}
      >
        <DndContext
          onDragEnd={onDragEnd}
          modifiers={[restrictToHorizontalAxis, restrictToParentElement]}
          sensors={sensors}
          collisionDetection={tabsCollisionDetection}
        >
          <SortableContext
            items={itemIds ?? []}
            strategy={horizontalListSortingStrategy}
          >
            {children}
          </SortableContext>
        </DndContext>
        {showScrollLeft && (
          <ScrollArrow direction="left" onClick={() => scroll("left")} />
        )}
        {showScrollRight && (
          <ScrollArrow direction="right" onClick={() => scroll("right")} />
        )}
      </TabList>
    );
  },
);

export const TabRow = ExplicitSize<TabRowProps<unknown>>()(TabRowInner) as <T>(
  props: TabRowProps<T>,
) => ReactNode;

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
      <Icon name={`chevron${direction}`} />
    </ScrollButton>
  );
}
