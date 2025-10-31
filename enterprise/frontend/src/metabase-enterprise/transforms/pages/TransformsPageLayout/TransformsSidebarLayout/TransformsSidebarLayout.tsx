import type { Location } from "history";

import { Flex } from "metabase/ui";

import { TransformsPageSidebar } from "../TransformsPageSidebar";

interface TransformsSidebarLayoutProps {
  children: React.ReactNode;
  location: Location;
}

export const TransformsSidebarLayout = ({
  children,
  location,
}: TransformsSidebarLayoutProps) => {
  return (
    <Flex direction="row">
      <TransformsPageSidebar location={location} />
      <Flex>{children}</Flex>
    </Flex>
  );
};
