import cx from "classnames";
import type { HTMLAttributes } from "react";

import { Box, type BoxProps } from "metabase/ui";

import S from "./Layout.module.css";

type Props = BoxProps & HTMLAttributes<HTMLDivElement>;

export function Layout(props: Props) {
  return <Box {...props} className={cx(S.layout, props.className)} />;
}

function LayoutHeader(props: Props) {
  return <Box {...props} className={cx(S.header, props.className)} />;
}

function LayoutMain(props: Props) {
  return <Box {...props} className={cx(S.main, props.className)} />;
}

function LayoutSidebar(props: Props) {
  return <Box {...props} className={cx(S.sidebar, props.className)} />;
}

function LayoutFooter(props: Props) {
  return <Box {...props} className={cx(S.footer, props.className)} />;
}

Layout.Header = LayoutHeader;
Layout.Main = LayoutMain;
Layout.Sidebar = LayoutSidebar;
Layout.Footer = LayoutFooter;
