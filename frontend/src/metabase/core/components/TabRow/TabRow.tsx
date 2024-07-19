import type { UniqueIdentifier, DragEndEvent } from "@dnd-kit/core";
import {
  DndContext,
  useSensor,
  PointerSensor,
  MouseSensor,
} from "@dnd-kit/core";
import {
  restrictToHorizontalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useCallback, useState, useRef, useLayoutEffect } from "react";
import { usePreviousDistinct } from "react-use";

import ExplicitSize from "metabase/components/ExplicitSize";
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

function TabRowInner<T>({
  width,
  onChange,
  children,
  itemIds,
  handleDragEnd,
  ...props
}: TabRowProps<T>) {
  const tabListRef = useRef<HTMLDivElement>(null);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [showScrollRight, setShowScrollRight] = useState(false);
  const showScrollLeft = scrollPosition > 0;

  const itemsCount = itemIds?.length ?? 0;
  const previousItemsCount = usePreviousDistinct(itemsCount) ?? 0;

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 10 },
  });

  // Needed for DnD e2e tests to work
  // See https://github.com/clauderic/dnd-kit/issues/208#issuecomment-824469766
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: { distance: 10 },
  });

  const scroll = useCallback(
    (direction: "left" | "right") => {
      if (!tabListRef.current || !width) {
        return;
      }
      const left = width * (direction === "left" ? -1 : 1);
      // @ts-expect-error — https://github.com/Microsoft/TypeScript/issues/28755
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
      onScroll={event => setScrollPosition(event.currentTarget.scrollLeft)}
      ref={tabListRef}
      {...props}
    >
      <DndContext
        onDragEnd={onDragEnd}
        modifiers={[restrictToHorizontalAxis, restrictToParentElement]}
        sensors={[pointerSensor, mouseSensor]}
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
}

const TabRowInnerWithSize = ExplicitSize()(TabRowInner);
export function TabRow<T>(props: TabRowProps<T>) {
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
