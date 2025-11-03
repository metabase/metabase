import { Flex } from "metabase/ui";

import S from "./SidebarContainer.module.css";

interface SidebarContainerProps {
  children: React.ReactNode;
}

export const SidebarContainer = ({ children }: SidebarContainerProps) => {
  return (
    <Flex direction="column" w={360} h="100%" className={S.root}>
      {children}
    </Flex>
  );
};
