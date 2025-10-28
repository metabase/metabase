import cx from "classnames";
import type { ReactNode } from "react";

import { Flex, Stack, Text } from "metabase/ui";

import S from "./BenchPaneHeader.module.css";

interface BenchPaneHeaderProps {
  title: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
  withBorder?: boolean;
}

export const BenchPaneHeader = ({
  title,
  actions,
  tabs,
  withBorder,
}: BenchPaneHeaderProps) => {
  return (
    <Stack
      className={cx(S.root, { [S.withBorder]: withBorder })}
      p="md"
      data-testid="bench-pane-header"
    >
      <Flex h="2rem" justify="space-between" align="center">
        <Text fw="bold">{title}</Text>
        <Flex>{actions}</Flex>
      </Flex>
      {tabs}
    </Stack>
  );
};
