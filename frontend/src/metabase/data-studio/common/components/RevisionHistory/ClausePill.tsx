import type { ReactNode } from "react";

import { Flex } from "metabase/ui";

import S from "./ClausePill.module.css";
import type { DefinitionType } from "./types";

type ClausePillProps = {
  children: ReactNode;
  variant: DefinitionType;
};

export function ClausePill({ children, variant }: ClausePillProps) {
  return (
    <Flex
      className={variant === "filters" ? S.filter : S.aggregation}
      align="center"
      px="sm"
      py={4}
      fw={600}
      fz="sm"
      lh={1.25}
      data-testid={`${variant}-pill`}
    >
      {children}
    </Flex>
  );
}
