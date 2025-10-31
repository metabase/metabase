import { VirtualizedList } from "metabase/common/components/VirtualizedList";
import { Flex } from "metabase/ui";

interface SidebarListProps {
  children: React.ReactNode[];
}

export const SidebarList = ({ children }: SidebarListProps) => {
  return (
    <Flex direction="column" flex={1} mih={0}>
      <VirtualizedList estimatedItemSize={64}>{children}</VirtualizedList>
    </Flex>
  );
};
