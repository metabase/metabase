import { useVirtualizer, type VirtualItem } from "@tanstack/react-virtual";
import { useRef } from "react";

import { Box } from "metabase/ui";

/**
 * Use this when you need to virtualize a 1-dimensional list of items with variable heights.
 * You can override the default wrapper element (just a div) by passing a `Wrapper` prop.
 *
 * It must be inside an element with a fixed height.
 */
export function VirtualizedList({
  children,
  Wrapper = Box,
  estimatedItemSize = 32,
}: {
  children: React.ReactNode[];
  Wrapper?: React.JSXElementConstructor<any>;
  estimatedItemSize?: number;
}) {
  const parentRef = useRef(null);

  const virtualizer = useVirtualizer({
    count: children.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimatedItemSize,
  });

  const items = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      style={{
        height: "100%",
        overflowY: "auto",
      }}
      data-testid="scroll-container"
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
            width: "100%",
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
