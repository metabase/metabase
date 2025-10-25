import type { ReactNode } from "react";

import { Flex, Stack } from "metabase/ui";

import S from "./ColumnLayout.module.css";

type ColumnLayoutProps = {
  children?: ReactNode;
};

export function ColumnLayout({ children }: ColumnLayoutProps) {
  return (
    <Flex direction="column" h="100%">
      {children}
    </Flex>
  );
}

type ColumnLayoutBodyProps = {
  children?: ReactNode;
};

export function ColumnLayoutBody({ children }: ColumnLayoutBodyProps) {
  return (
    <Flex className={S.body} flex={1} justify="center" p="xl" bg="bg-light">
      <Stack flex={1} gap="xl" maw="50rem">
        {children}
      </Stack>
    </Flex>
  );
}
