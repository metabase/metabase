import { Flex } from "metabase/ui";

import { TransformsInnerNav } from "../TransformsInnerNav";

interface TransformsTopNavLayoutProps {
  children: React.ReactNode;
}

export const TransformsTopNavLayout = ({
  children,
}: TransformsTopNavLayoutProps) => {
  return (
    <Flex direction="column" w="100%">
      <Flex direction="column" p="md" w={360}>
        <TransformsInnerNav />
      </Flex>
      <Flex>{children}</Flex>
    </Flex>
  );
};
