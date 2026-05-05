import cx from "classnames";
import type { ReactNode } from "react";

import { Box } from "metabase/ui";

import ViewSidebarS from "./ViewSidebar.module.css";

interface ViewSidebarProps {
  side: "left" | "right";
  width?: number;
  isOpen?: boolean;
  children?: ReactNode;
}

export const ViewSidebar = ({
  side = "right",
  width = 400,
  isOpen,
  children,
}: ViewSidebarProps) => (
  // If we passed `width` as prop, it would end up in the final HTML elements.
  // This would ruin the animation, so we pass it as `widthProp`.
  <Box
    className={cx(ViewSidebarS.ViewSidebarAside, {
      [ViewSidebarS.rightSide]: side === "right",
      [ViewSidebarS.leftSide]: side === "left",
      [ViewSidebarS.isOpen]: isOpen,
    })}
    component="aside"
    data-testid={`sidebar-${side}`}
    w={isOpen ? width : undefined}
    left={side === "left" ? 0 : undefined}
    right={side === "right" ? 0 : undefined}
  >
    <Box w={width} pos="absolute" h="100%">
      {children}
    </Box>
  </Box>
);
