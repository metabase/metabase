import cx from "classnames";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { Box, type BoxProps } from "metabase/ui";

import S from "./Breadcrumb.module.css";

interface Props extends BoxProps {
  children?: ReactNode;
  href?: string;
}

export const Breadcrumb = ({ children, className, href, ...props }: Props) => {
  if (href) {
    return (
      <Box
        c="text-secondary"
        className={cx(S.breadcrumb, S.link, className)}
        component={Link}
        to={href}
        {...props}
      >
        <Ellipsified>{children}</Ellipsified>
      </Box>
    );
  }

  return (
    <Box c="text-secondary" className={cx(S.breadcrumb, className)} {...props}>
      <Ellipsified>{children}</Ellipsified>
    </Box>
  );
};
