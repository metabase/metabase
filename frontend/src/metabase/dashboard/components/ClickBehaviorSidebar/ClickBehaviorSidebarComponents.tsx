import { Box, type BoxProps, Title, type TitleProps } from "metabase/ui";

import S from "./ClickBehaviorSidebar.module.css";

export const Heading = (props: TitleProps) => {
  return <Title order={4} className={S.Heading} {...props} />;
};

export const SidebarContent = (
  props: BoxProps & { children?: React.ReactNode },
) => {
  return <Box px="xl" {...props} />;
};
