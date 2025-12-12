import type { ReactNode } from "react";

import { Flex } from "metabase/ui";

interface TransformTopNavLayoutProps {
  children: ReactNode;
}

export const TransformTopNavLayout = ({
  children,
}: TransformTopNavLayoutProps) => {
  return (
    <Flex direction="column" w="100%" h="100%">
      {children}
    </Flex>
  );
};
