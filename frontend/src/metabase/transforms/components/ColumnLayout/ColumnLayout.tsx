import type { ReactNode } from "react";

import { Flex, type FlexProps, Stack } from "metabase/ui";

import S from "./ColumnLayout.module.css";

type ColumnLayoutProps = {
  children?: ReactNode;
  "data-testid"?: string;
} & FlexProps;

export function ColumnLayout({
  children,
  "data-testid": dataTestId,
  ...flexProps
}: ColumnLayoutProps) {
  return (
    <Flex direction="column" h="100%" data-testid={dataTestId} {...flexProps}>
      {children}
    </Flex>
  );
}

type ColumnLayoutBodyProps = {
  children?: ReactNode;
};

export function ColumnLayoutBody({ children }: ColumnLayoutBodyProps) {
  return (
    <Flex
      className={S.body}
      flex={1}
      justify="center"
      pt="3.5rem"
      pb="xl"
      px="xl"
      bg="background-secondary"
    >
      <Stack flex={1} gap="3.5rem" maw="50rem">
        {children}
      </Stack>
    </Flex>
  );
}
