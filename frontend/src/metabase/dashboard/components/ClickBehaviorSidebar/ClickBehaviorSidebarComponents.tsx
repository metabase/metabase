import cx from "classnames";

import { Box, type BoxProps, Title, type TitleProps } from "metabase/ui";

import S from "./ClickBehaviorSidebar.module.css";

export const Heading = (props: TitleProps) => {
  const { className, ...rest } = props;

  return <Title order={4} className={cx(S.Heading, className)} {...rest} />;
};

export const SidebarContent = (
  props: BoxProps & { children?: React.ReactNode },
) => {
  return <Box px="xl" {...props} />;
};
