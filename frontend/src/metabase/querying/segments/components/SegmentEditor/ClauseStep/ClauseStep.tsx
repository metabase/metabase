import type { ReactNode } from "react";

import { Box, Flex } from "metabase/ui";

import S from "./ClauseStep.module.css";

type ClauseStepProps = {
  label?: string;
  children?: ReactNode;
};

export function ClauseStep({ label, children }: ClauseStepProps) {
  return (
    <Flex className={S.root} p="md" align="center">
      {label && (
        <Box className={S.label} fz="xs">
          {label}
        </Box>
      )}
      {children}
    </Flex>
  );
}
