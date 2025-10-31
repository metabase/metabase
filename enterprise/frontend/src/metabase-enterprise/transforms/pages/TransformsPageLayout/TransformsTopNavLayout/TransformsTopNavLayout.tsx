import type { Location } from "history";

import { Flex } from "metabase/ui";

import { TransformsInnerNav } from "../TransformsInnerNav";

interface TransformsTopNavLayoutProps {
  children: React.ReactNode;
  location: Location;
}

export const TransformsTopNavLayout = ({
  children,
  location,
}: TransformsTopNavLayoutProps) => {
  return (
    <Flex direction="column" w="100%">
      <Flex direction="column" p="md" w={360}>
        <TransformsInnerNav location={location} />
      </Flex>
      <Flex>{children}</Flex>
    </Flex>
  );
};
