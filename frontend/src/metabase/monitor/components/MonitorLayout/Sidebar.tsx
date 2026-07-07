import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import ErrorBoundary from "metabase/ErrorBoundary";

import { useMonitorSidebarContext } from "./MonitorContent";
import { SidebarResizableBox } from "./SidebarResizableBox";

const SIDEBAR_WIDTH = 512;

type SidebarProps = {
  children: ReactNode;
  defaultWidth?: number;
} & (
  | {
      resizable?: true;
      containerWidth: number;
    }
  | {
      resizable: false;
    }
);

/**
 * Portal for Monitor views' sidebar outlet. Resizable by default.
 */
export function Sidebar(props: SidebarProps) {
  const { children, defaultWidth = SIDEBAR_WIDTH } = props;
  const { sidebarNode } = useMonitorSidebarContext();

  if (sidebarNode == null) {
    return null;
  }

  const content = <ErrorBoundary>{children}</ErrorBoundary>;

  return createPortal(
    props.resizable === false ? (
      content
    ) : (
      <SidebarResizableBox
        containerWidth={props.containerWidth}
        defaultWidth={defaultWidth}
      >
        {content}
      </SidebarResizableBox>
    ),
    sidebarNode,
  );
}
