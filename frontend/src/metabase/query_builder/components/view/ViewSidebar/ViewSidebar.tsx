import cx from "classnames";
import type { ReactNode } from "react";

import { Box } from "metabase/ui";

import ViewSidebarS from "./ViewSidebar.module.css";

interface ViewSidebarProps {
  side: "left" | "right";
  width?: number;
  isOpen?: boolean;
  children?: ReactNode;
  "data-testid"?: string;
}

export const ViewSidebar = ({
  side = "right",
  width = 400,
  isOpen,
  children,
  "data-testid": dataTestId = `sidebar-${side}`,
}: ViewSidebarProps) => (
  <Box
    className={cx(ViewSidebarS.ViewSidebarAside, {
      [ViewSidebarS.rightSide]: side === "right",
      [ViewSidebarS.leftSide]: side === "left",
      [ViewSidebarS.isOpen]: isOpen,
    })}
    component="aside"
    data-testid={dataTestId}
    w={isOpen ? width : undefined}
    left={side === "left" ? 0 : undefined}
    right={side === "right" ? 0 : undefined}
  >
    <Box w={width} pos="absolute" h="100%">
      {children}
    </Box>
  </Box>
);
