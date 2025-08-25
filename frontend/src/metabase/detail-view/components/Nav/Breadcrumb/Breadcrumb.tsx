import cx from "classnames";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import {
  Box,
  type BoxProps,
  Group,
  Icon,
  type IconName,
  rem,
} from "metabase/ui";

import S from "./Breadcrumb.module.css";

interface Props extends BoxProps {
  children?: ReactNode;
  icon?: IconName;
  href?: string;
}

export const Breadcrumb = ({
  children,
  className,
  href,
  icon,
  ...props
}: Props) => {
  const content = (
    <Ellipsified tooltip={children}>
      <Group align="center" gap={rem(10)} wrap="nowrap">
        {icon && <Icon flex="0 0 auto" name={icon} />}

        <Box>{children}</Box>
      </Group>
    </Ellipsified>
  );

  if (href) {
    return (
      <Box
        c="text-secondary"
        className={cx(S.breadcrumb, S.link, className)}
        component={Link}
        to={href}
        {...props}
      >
        {content}
      </Box>
    );
  }

  return (
    <Box c="text-secondary" className={cx(S.breadcrumb, className)} {...props}>
      {content}
    </Box>
  );
};
