import type { ReactNode } from "react";

import { Flex } from "metabase/ui";

interface TransformsTopNavLayoutProps {
  children: ReactNode;
}

export const TransformsTopNavLayout = ({
  children,
}: TransformsTopNavLayoutProps) => {
  return (
    <Flex direction="column" w="100%" h="100%">
      {children}
    </Flex>
  );
};
