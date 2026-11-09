import cx from "classnames";
import type { HTMLAttributes } from "react";

import { Box, type BoxProps } from "metabase/ui";

import S from "./Layout.module.css";

type Props = BoxProps & HTMLAttributes<HTMLDivElement>;

export function Layout({ inline, ...props }: Props & { inline?: boolean }) {
  return (
    <Box
      {...props}
      className={cx(S.layout, { [S.inline]: inline }, props.className)}
    />
  );
}

export function LayoutHeader(props: Props) {
  return <Box {...props} className={cx(S.header, props.className)} />;
}

export function LayoutMain(props: Props) {
  return <Box {...props} className={cx(S.main, props.className)} />;
}

export function LayoutSidebar(props: Props) {
  return <Box {...props} className={cx(S.sidebar, props.className)} />;
}

export function LayoutFooter(props: Props) {
  return <Box {...props} className={cx(S.footer, props.className)} />;
}
