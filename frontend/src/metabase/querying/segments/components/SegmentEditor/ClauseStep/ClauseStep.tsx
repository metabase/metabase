import type { ReactNode } from "react";

import { Box } from "metabase/ui";

import S from "./ClauseStep.module.css";

type ClauseStepProps = {
  label?: string;
  children?: ReactNode;
};

export function ClauseStep({ label, children }: ClauseStepProps) {
  return (
    <Box className={S.root} px="md" py="lg">
      {label && (
        <Box className={S.label} fz="xs">
          {label}
        </Box>
      )}
      {children}
    </Box>
  );
}
