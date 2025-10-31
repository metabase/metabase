import type { ReactNode } from "react";

import { Flex } from "metabase/ui";

import { BenchNav } from "./BenchNav";

type BenchLayoutProps = {
  children?: ReactNode;
};

export function BenchLayout({ children }: BenchLayoutProps) {
  return (
    <Flex h="100%">
      <BenchNav />
      {children}
    </Flex>
  );
}
