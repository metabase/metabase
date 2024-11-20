import type { ReactNode } from "react";

import { Box } from "metabase/ui";

type ClauseStepProps = {
  label: string;
  children?: ReactNode;
};

export function ClauseStep({ label, children }: ClauseStepProps) {
  return (
    <Box pos="relative" p="md">
      <Box c="text-medium">{label}</Box>
      {children}
    </Box>
  );
}
