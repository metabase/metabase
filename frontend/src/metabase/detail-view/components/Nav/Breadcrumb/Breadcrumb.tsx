import cx from "classnames";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { Box, type BoxProps } from "metabase/ui";

import S from "./Breadcrumb.module.css";

interface Props extends BoxProps {
  children?: ReactNode;
  href?: string;
}

export const Breadcrumb = ({ children, className, href, ...props }: Props) => {
  if (href) {
    <Box
      c="text-light"
      className={cx(S.breadcrumb, className)}
      component={Link}
      flex="0 0 auto"
      fw="bold"
      to={href}
      {...props}
    >
      {children}
    </Box>;
  }

  return (
    <Box
      c="text-light"
      className={cx(S.breadcrumb, className)}
      flex="0 0 auto"
      fw="bold"
      {...props}
    >
      {children}
    </Box>
  );
};
