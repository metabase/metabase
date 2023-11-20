import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

import { Box } from "metabase/ui";

/**
 * Use this when you need to virtualize a 1-dimensional list of items with variable heights.
 * You can override the default wrapper element (just a div) by passing a `Wrapper` prop.
 */
export function VariableSizeItemsVirtualizedList({
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
          {items.map(virtualRow => (
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
