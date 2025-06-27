import cx from "classnames";
import type { ReactNode } from "react";

import Link from "metabase/common/components/Link";
import { Box, type BoxProps } from "metabase/ui";

import S from "./HomeCard.module.css";

type HomeCardProps<C extends React.ElementType> = {
  className?: string;
  children?: ReactNode;
  component?: C;
} & React.ComponentProps<C> &
  BoxProps;

export const HomeCard = <C extends React.ElementType = typeof Link>({
  className,
  children,
  component = Link,
  ...rest
}: HomeCardProps<C>): JSX.Element => {
  return (
    <Box component={component} className={cx(className, S.Root)} {...rest}>
      {children}
    </Box>
  );
};
