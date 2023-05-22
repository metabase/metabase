import React, { useState, useRef, useEffect } from "react";
import { DndContext, useSensor, PointerSensor } from "@dnd-kit/core";
import type { UniqueIdentifier, DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  restrictToHorizontalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers";

import Icon from "metabase/components/Icon/Icon";
import ExplicitSize from "metabase/components/ExplicitSize";
import { TabListProps } from "../TabList/TabList";
import { ScrollButton, TabList } from "./TabRow.styled";

interface TabRowProps<T> extends TabListProps<T> {
  width?: number | null;
  itemIds?: UniqueIdentifier[];
  handleDragEnd?: (
    activeId: UniqueIdentifier,
    overId: UniqueIdentifier,
  ) => void;
  renderDragOverlayChildren?: (activeId: UniqueIdentifier) => JSX.Element;
}

function TabRowInner<T>({
  width,
  onChange,
  children,
  itemIds,
  handleDragEnd,
  renderDragOverlayChildren,
  ...props
}: TabRowProps<T>) {
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

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 10 },
  });

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
        sensors={[pointerSensor]}
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
