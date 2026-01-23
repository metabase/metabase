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

  useEffect(() => {
    // If the height is higher than the max height,
    // resize to the max height
    if (maxHeight == null) {
      return;
    }
    if (height >= maxHeight) {
      resize(Math.max(minHeight, maxHeight));
    }
  }, [height, minHeight, maxHeight, resize]);

  // reset height to initialHeight if it started of as Infinity
  if (height === Infinity && initialHeight !== Infinity) {
    setHeight(initialHeight);
  }

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
      resizeHandles={["s"]}
      onResize={handleResize}
      onResizeStop={handleResize}
    >
      <Flex w="100%" flex="1" h={height} className={className}>
        {children}
      </Flex>
    </Resizable>
  );
}
