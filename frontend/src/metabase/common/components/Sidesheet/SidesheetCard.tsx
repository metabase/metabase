import type React from "react";

import CS from "metabase/css/core/index.css";
import { Paper, Title, Stack, type MantineStyleSystemProps } from "metabase/ui";

interface SidesheetCardProps {
  title?: string;
  children: React.ReactNode;
  styleProps?: Partial<MantineStyleSystemProps>;
}

export const SidesheetCard = ({
  title,
  children,
  ...styleProps
}: SidesheetCardProps) => {
  return (
    <Paper p="lg" withBorder shadow="none" {...styleProps}>
      {title && (
        <Title mb="sm" size="sm" color="text-light">
          {title}
        </Title>
      )}
      <Stack spacing="md" className={CS.textMedium}>
        {children}
      </Stack>
    </Paper>
  );
};
