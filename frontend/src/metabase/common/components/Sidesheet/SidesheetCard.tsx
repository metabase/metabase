import type React from "react";

import CS from "metabase/css/core/index.css";
import { Paper, type PaperProps, Stack, Title } from "metabase/ui";

type SidesheetCardProps = {
  title?: React.ReactNode;
  children: React.ReactNode;
} & PaperProps;

export const SidesheetCard = ({
  title,
  children,
  ...paperProps
}: SidesheetCardProps) => {
  return (
    <Paper p="lg" withBorder shadow="none" {...paperProps}>
      {title && (
        <Title lh={1} mb=".75rem" size="sm" c="text-light" order={4}>
          {title}
        </Title>
      )}
      <Stack gap="md" className={CS.textMedium}>
        {children}
      </Stack>
    </Paper>
  );
};
