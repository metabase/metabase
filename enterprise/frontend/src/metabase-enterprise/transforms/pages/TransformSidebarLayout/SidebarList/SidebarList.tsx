import { VirtualizedList } from "metabase/common/components/VirtualizedList";
import { Box, Flex } from "metabase/ui";

interface SidebarListProps {
  children: React.ReactNode[];
}

const ListWrapper = ({ children, style }: any) => (
  <Box px="md" style={style}>
    {children}
  </Box>
);

export const SidebarList = ({ children }: SidebarListProps) => {
  return (
    <Flex direction="column" flex={1} mih={0}>
      <VirtualizedList estimatedItemSize={64} Wrapper={ListWrapper}>
        {children}
      </VirtualizedList>
    </Flex>
  );
};
