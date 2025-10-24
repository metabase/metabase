import cx from "classnames";
import type { ReactNode } from "react";

import { Flex, Text } from "metabase/ui";

import S from "./BenchPaneHeader.module.css";

interface BenchPaneHeaderProps {
  title: ReactNode;
  actions?: ReactNode;
  withBorder?: boolean;
}

export const BenchPaneHeader = ({
  title,
  actions,
  withBorder,
}: BenchPaneHeaderProps) => {
  return (
    <Flex
      className={cx(S.root, { [S.withBorder]: withBorder })}
      p="md"
      justify="space-between"
      align="center"
      data-testid="bench-pane-header"
    >
      <Text fw="bold">{title}</Text>
      <Flex>{actions}</Flex>
    </Flex>
  );
};
