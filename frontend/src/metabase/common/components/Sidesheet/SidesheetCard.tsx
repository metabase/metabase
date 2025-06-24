import type React from "react";

import CS from "metabase/css/core/index.css";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import {
  Paper,
  type PaperProps,
  Stack,
  type StackProps,
  Title,
  type TitleProps,
} from "metabase/ui";

export type SidesheetCardProps = {
  title?: React.ReactNode;
  children: React.ReactNode;
  stackProps?: StackProps;
} & PaperProps;

export const SidesheetCard = ({
  title,
  children,
  stackProps,
  ...paperProps
}: SidesheetCardProps) => {
  const titleId = useUniqueId();
  return (
    <Paper
      p="lg"
      withBorder
      shadow="none"
      aria-labelledby={title ? titleId : undefined}
      {...paperProps}
    >
      {title && <SidesheetCardTitle id={titleId}>{title}</SidesheetCardTitle>}
      <Stack gap="md" className={CS.textMedium} {...stackProps}>
        {children}
      </Stack>
    </Paper>
  );
};

export const SidesheetCardTitle = (props: TitleProps) => (
  <Title lh={1} mb=".75rem" c="text-medium" order={4} {...props} />
);
