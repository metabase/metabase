import type React from "react";

import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import CS from "metabase/css/core/index.css";
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
  <Title mb="sm" c="text-secondary" order={4} {...props} />
);
