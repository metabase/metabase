import type { ReactNode } from "react";

import { Flex } from "metabase/ui";

import S from "./BenchHeader.module.css";

interface BenchHeaderProps {
  title: ReactNode;
  actions?: ReactNode;
}

export const BenchHeader = ({ title, actions }: BenchHeaderProps) => {
  return (
    <Flex className={S.header} p="md" align="center">
      {title}
      {actions}
    </Flex>
  );
};
