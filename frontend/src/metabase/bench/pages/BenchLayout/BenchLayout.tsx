import type { Location } from "history";
import type { ReactNode } from "react";

import { Box, Flex } from "metabase/ui";

import { BenchNav } from "./BenchNav";

type BenchLayoutProps = {
  location: Location;
  children?: ReactNode;
};

export function BenchLayout({ location, children }: BenchLayoutProps) {
  return (
    <Flex h="100%">
      <BenchNav location={location} />
      <Box h="100%" flex={1}>
        {children}
      </Box>
    </Flex>
  );
}
