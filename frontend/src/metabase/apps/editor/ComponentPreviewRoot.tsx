import type { PropsWithChildren } from "react";

import { Flex } from "metabase/ui";

import type { ComponentConfiguration } from "../types";

type Props = PropsWithChildren<{
  configuration: ComponentConfiguration;
}>;

export function ComponentPreviewRoot({ children }: Props) {
  return (
    <Flex w="100%" h="100%" align="center" justify="center">
      {children}
    </Flex>
  );
}
