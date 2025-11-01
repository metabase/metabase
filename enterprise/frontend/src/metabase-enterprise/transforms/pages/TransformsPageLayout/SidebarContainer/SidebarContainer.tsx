import { Flex } from "metabase/ui";

import S from "./SidebarContainer.module.css";

interface SidebarContainerProps {
  children: React.ReactNode;
}

export const SidebarContainer = ({ children }: SidebarContainerProps) => {
  return (
    <Flex direction="column" w={360} p="md" gap="md" className={S.root}>
      {children}
    </Flex>
  );
};
