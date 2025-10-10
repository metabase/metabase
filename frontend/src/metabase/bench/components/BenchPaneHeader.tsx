import type { ReactNode } from "react";

import { Flex, Text } from "metabase/ui";

interface BenchPaneHeaderProps {
  title: ReactNode;
  actions: ReactNode;
}

export const BenchPaneHeader = ({ title, actions }: BenchPaneHeaderProps) => {
  return (
    <Flex p="md" justify="space-between" align="center">
      <Text fw="bold">{title}</Text>
      <Flex>{actions}</Flex>
    </Flex>
  );
};
