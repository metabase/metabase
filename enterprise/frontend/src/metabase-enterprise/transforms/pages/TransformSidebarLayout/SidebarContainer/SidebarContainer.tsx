import { Flex } from "metabase/ui";

import S from "./SidebarContainer.module.css";

interface SidebarContainerProps {
  children: React.ReactNode;
  "data-testid"?: string;
}

export const SidebarContainer = ({
  children,
  "data-testid": dataTestId,
}: SidebarContainerProps) => {
  return (
    <Flex
      data-testid={dataTestId}
      direction="column"
      w={360}
      h="100%"
      className={S.root}
    >
      {children}
    </Flex>
  );
};
