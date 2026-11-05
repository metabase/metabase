import cx from "classnames";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { Children, cloneElement } from "react";

import CS from "metabase/css/core/index.css";

type LayoutChild = ReactElement<{
  children?: ReactNode;
  style?: CSSProperties;
  className?: string;
}>;

interface SidebarLayoutProps {
  className?: string;
  style?: CSSProperties;
  sidebar: LayoutChild;
  children: LayoutChild;
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
    {cloneElement(
      sidebar,
      {
        style: { flexShrink: 0, alignSelf: "stretch" },
        className: cx(
          CS.scrollY,
          CS.scrollShow,
          CS.scrollLight,
          CS.scrollShowHover,
        ),
      },
      sidebar.props.children,
    )}
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
