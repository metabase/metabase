import type { Location } from "history";
import type { ReactNode } from "react";

import { Flex } from "metabase/ui";

import { BenchNav } from "./BenchNav";

type BenchLayoutProps = {
  location: Location;
  children?: ReactNode;
};

export function BenchLayout({ location, children }: BenchLayoutProps) {
  return (
    <Flex h="100%">
      <BenchNav location={location} />
      {children}
    </Flex>
  );
}
