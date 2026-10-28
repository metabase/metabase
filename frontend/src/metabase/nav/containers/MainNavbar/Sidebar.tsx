import cx from "classnames";
import type { CSSProperties, ReactNode } from "react";

import CS from "metabase/css/core/index.css";
import { NAV_SIDEBAR_WIDTH } from "metabase/nav/constants";
import { Box, type BoxProps, Text, type TextProps } from "metabase/ui";

import S from "./Sidebar.module.css";

type SidebarCssVariables = CSSProperties & {
  "--sidebar-width": string;
};

interface SidebarProps extends BoxProps {
  isOpen: boolean;
  side: "left" | "right";
  width?: string;
  children?: ReactNode;
}

export const Sidebar = ({
  isOpen,
  side,
  width = NAV_SIDEBAR_WIDTH,
  className,
  style,
  ...props
}: SidebarProps) => {
  const vars: SidebarCssVariables = { "--sidebar-width": width };

  return (
    <Box
      component="aside"
      className={cx(
        S.sidebar,
        side === "left" ? S.left : S.right,
        CS.flexNoShrink,
        className,
      )}
      style={style ? [vars, style] : vars}
      display={isOpen ? undefined : "none"}
      h="100%"
      bg="background_page-primary"
      {...props}
    />
  );
};

interface SidebarSectionProps extends BoxProps {
  children?: ReactNode;
}

export const SidebarSection = (props: SidebarSectionProps) => (
  <Box mt="sm" mb="lg" px="lg" {...props} />
);

interface SidebarHeadingProps extends TextProps {
  children?: ReactNode;
}

export const SidebarHeading = (props: SidebarHeadingProps) => (
  <Text
    component="h4"
    c="text-secondary"
    fz="xs"
    fw={700}
    lh="normal"
    tt="uppercase"
    lts="0.45px"
    ps="lg"
    {...props}
  />
);
