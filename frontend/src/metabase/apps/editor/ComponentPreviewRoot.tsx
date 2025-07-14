/* eslint-disable no-restricted-imports */
import { Container } from "@mantine/core";
import type { PropsWithChildren } from "react";

import { Flex } from "metabase/ui";

import { DEFAULT_SPACING } from "../const/systemComponents";
import type { ComponentConfiguration } from "../types";

type Props = PropsWithChildren<{
  configuration: ComponentConfiguration;
}>;

export function ComponentPreviewRoot({ configuration, children }: Props) {
  if (configuration.type === "page") {
    return (
      <Container size="xl" p={configuration.pagePadding ?? DEFAULT_SPACING}>
        {children}
      </Container>
    );
  }

  return (
    <Flex w="100%" h="100%" align="center" p="xl" justify="center">
      {children}
    </Flex>
  );
}
