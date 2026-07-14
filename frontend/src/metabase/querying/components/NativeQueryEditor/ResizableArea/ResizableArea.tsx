import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Resizable } from "react-resizable";

import { Flex } from "metabase/ui";

import S from "./ResizableArea.module.css";

// ResizableArea is a wrapper around Resizable that
// automatically resizes the editor when the max height changes
export function ResizableArea(props: {
  children: ReactNode;
  resizable: boolean;
  initialHeight: number;
  minHeight?: number;
  maxHeight: number;
  onResize?: (height: number) => void;
  className?: string;
}) {
  const {
    children,
    resizable,
    initialHeight,
    minHeight = 0,
    maxHeight: maxHeightFromProps,
    onResize,
    className,
  } = props;

  const maxHeight =
    maxHeightFromProps != null && maxHeightFromProps <= 0
      ? Infinity
      : maxHeightFromProps;
  const [height, setHeight] = useState(initialHeight);

  const resize = useCallback(
    (height: number) => {
      if (!resizable) {
        return;
      }

      onResize?.(height);
      setHeight(height);
    },
    [onResize, resizable],
  );

  const handleResize = useCallback(
    (_event: unknown, data: { size: { height: number } }) => {
      const { height } = data.size;
      resize(height);
    },
    [resize],
  );

  // Grow with the parent when layout expands (e.g. New Query SQL
  // idle card → full-width editor). Don't shrink on initialHeight
  // changes — that would fight manual resizing.
  useEffect(() => {
    setHeight((current) =>
      initialHeight > current ? initialHeight : current,
    );
  }, [initialHeight]);

  useEffect(() => {
    // If the height is higher than the max height,
    // resize to the max height. Skip while maxHeight is still
    // below minHeight — that usually means the parent layout
    // hasn't settled yet (e.g. an expanding container).
    if (maxHeight == null || maxHeight === Infinity) {
      return;
    }
    if (maxHeight < minHeight) {
      return;
    }
    if (height >= maxHeight) {
      resize(maxHeight);
    }
  }, [height, minHeight, maxHeight, resize]);

  // reset height to initialHeight if it started of as Infinity
  if (height === Infinity && initialHeight !== Infinity) {
    setHeight(initialHeight);
  }

  const handleDragHandleMouseDown = useCallback((event: Event) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const dragHandle = (
    <div className={S.dragHandleContainer} data-testid="drag-handle">
      <div className={S.dragHandle} />
    </div>
  );

  if (!resizable) {
    return (
      <Flex w="100%" flex="1" h="100%" className={className}>
        {children}
      </Flex>
    );
  }

  return (
    <Resizable
      height={height}
      minConstraints={[Infinity, minHeight]}
      maxConstraints={[Infinity, maxHeight]}
      axis="y"
      handle={dragHandle}
      resizeHandles={resizable ? ["s"] : []}
      draggableOpts={{ onMouseDown: handleDragHandleMouseDown }}
      onResize={handleResize}
      onResizeStop={handleResize}
    >
      <Flex
        w="100%"
        flex="1"
        h={resizable ? height : "100%"}
        className={className}
      >
        {children}
      </Flex>
    </Resizable>
  );
}
