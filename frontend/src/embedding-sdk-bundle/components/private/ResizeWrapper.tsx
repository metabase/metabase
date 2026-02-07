import { useResizeObserver } from "@mantine/hooks";
import type { ReactNode, RefObject } from "react";

import { Box, type BoxProps } from "metabase/ui";

/**
 * Props for the ResizeWrapper component.
 * @extends BoxProps
 */
interface ResizeWrapperProps extends BoxProps {
  /** Content to be wrapped and resized */
  children: ReactNode;
  /** Optional ref to attach to the inner div that receives the measured dimensions */
  ref?: RefObject<HTMLDivElement>;
}

/**
 * A wrapper component that measures available space and applies those dimensions to its children.
 *
 * Uses a resize observer on the outer container to track size changes, then applies
 * the measured dimensions to an inner div wrapping the children. This ensures children
 * render with explicit dimensions matching their available space.
 *
 * @param props - Component props
 * @param props.children - Content to render inside the measured container
 * @param props.ref - Optional ref for the inner div (renamed to divRef internally to avoid conflict)
 * @param props...props - Additional BoxProps passed to the outer Box container
 *
 * @example
 * ```tsx
 * <ResizeWrapper>
 *   <MyChart />
 * </ResizeWrapper>
 * ```
 */
export function ResizeWrapper({
  children,
  ref: divRef,
  ...props
}: ResizeWrapperProps) {
  const [ref, rect] = useResizeObserver();

  return (
    <Box ref={ref} w="100%" h="100%" {...props}>
      <div
        ref={divRef}
        style={{
          width: rect.width,
          height: rect.height,
        }}
      >
        {children}
      </div>
    </Box>
  );
}
