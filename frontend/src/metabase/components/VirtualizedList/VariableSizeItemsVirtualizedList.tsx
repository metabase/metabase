import { useVirtualizer, type VirtualItem } from "@tanstack/react-virtual";
import { useRef } from "react";
import { useMount } from "react-use";

import { Box } from "metabase/ui";

/**
 * Use this when you need to virtualize a 1-dimensional list of items with variable heights.
 * You can override the default wrapper element (just a div) by passing a `Wrapper` prop.
 */
export function VariableSizeItemsVirtualizedList({
  children,
  Wrapper = Box,
  estimatedItemSize = 32,
  scrollTo,
}: {
  children: React.ReactNode[];
  Wrapper?: React.JSXElementConstructor<any>;
  estimatedItemSize?: number;
  scrollTo?: number;
}) {
  const parentRef = useRef(null);

  const virtualizer = useVirtualizer({
    count: children.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimatedItemSize,
  });

  const items = virtualizer.getVirtualItems();

  useMount(() => {
    if (scrollTo && scrollTo < children.length) {
      // we need to wait for dynamic measurements to be taken before scrolling
      window.requestAnimationFrame(() => {
        virtualizer.scrollToIndex(scrollTo, { align: "center" });
      });
    }
  });

  return (
    <div
      ref={parentRef}
      style={{
        height: "100%",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: "relative",
        }}
      >
        <Wrapper
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            transform: `translateY(${items[0]?.start ?? 0}px)`,
          }}
        >
          {items.map((virtualRow: VirtualItem) => (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
            >
              {children[virtualRow.index]}
            </div>
          ))}
        </Wrapper>
      </div>
    </div>
  );
}
