import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import ErrorBoundary from "metabase/ErrorBoundary";

import { useMonitorSidebarContext } from "./MonitorContent";
import S from "./Sidebar.module.css";
import { SidebarResizableBox } from "./SidebarResizableBox";

const SIDEBAR_WIDTH = 512;

type SidebarProps = {
  children: ReactNode;
  defaultWidth?: number;
} & (
  | {
      resizable?: true;
      /** Width of the view's content area, used to cap the sidebar width. */
      containerWidth: number;
    }
  | {
      resizable: false;
    }
);

/**
 * Portal for Monitor views' sidebar outlet. The sidebar is resizable by
 * default; the Monitor content area is protected from text selection while
 * dragging.
 */
export function Sidebar(props: SidebarProps) {
  const { children, defaultWidth = SIDEBAR_WIDTH } = props;
  const { sidebarNode } = useMonitorSidebarContext();
  const containerNode = sidebarNode?.parentElement ?? null;
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    if (containerNode == null || !isResizing) {
      return;
    }

    containerNode.classList.add(S.resizing);
    return () => containerNode.classList.remove(S.resizing);
  }, [containerNode, isResizing]);

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
        onResizeStart={() => setIsResizing(true)}
        onResizeStop={() => setIsResizing(false)}
      >
        {content}
      </SidebarResizableBox>
    ),
    sidebarNode,
  );
}
