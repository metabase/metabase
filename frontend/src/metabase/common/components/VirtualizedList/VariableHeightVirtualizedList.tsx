import { useMounted } from "@mantine/hooks";
import { type VirtualItem, useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

import { Box } from "metabase/ui";

import { useEffectOnceIf } from "./use-effect-once-if";

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
  extraPadding = 0, // sometimes needed to prevent unnecessary scrollbars
  scrollTo,
}: {
  children: React.ReactNode[];
  Wrapper?: React.JSXElementConstructor<any>;
  estimatedItemSize?: number;
  extraPadding?: number;
  scrollTo?: number;
}) {
  const parentRef = useRef(null);
  const isMounted = useMounted();

  const virtualizer = useVirtualizer({
    count: children.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimatedItemSize,
    overscan: Number(process.env.OVERSCAN) || 5, // makes unit testing easier
  });

  const items = virtualizer.getVirtualItems();

  useEffectOnceIf(
    () => {
      if (scrollTo && scrollTo < children.length) {
        window.requestAnimationFrame(() => {
          virtualizer.scrollToIndex(scrollTo, { align: "center" });
        });
      }
    },
    isMounted && scrollTo !== undefined && scrollTo !== -1,
  );

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
          height: virtualizer.getTotalSize() + extraPadding,
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
