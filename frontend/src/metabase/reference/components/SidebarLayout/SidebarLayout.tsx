import type { CSSProperties, ReactElement } from "react";
import { Children, cloneElement } from "react";

import { ResizableSidePanel } from "metabase/common/components/ResizableSidePanel";

interface SidebarLayoutProps {
  className?: string;
  style?: CSSProperties;
  sidebar: ReactElement;
  children: ReactElement;
}

export const SidebarLayout = ({
  className,
  style,
  sidebar,
  children,
}: SidebarLayoutProps) => (
  <div
    className={className}
    style={{ ...style, display: "flex", flexDirection: "row" }}
  >
    <ResizableSidePanel storageKey="reference-nav" side="left" defaultSize="md">
      {sidebar}
    </ResizableSidePanel>
    {cloneElement(
      Children.only(children),
      {
        style: {
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          height: "100%",
        },
      },
      Children.only(children).props.children,
    )}
  </div>
);
