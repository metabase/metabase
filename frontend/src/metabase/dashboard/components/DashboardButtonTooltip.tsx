import type { ReactNode } from "react";
import { Box, Text, Tooltip } from "metabase/ui";

type DashboardButtonTooltipProps = {
  children: ReactNode;
  label: string;
  disabled?: boolean;
};

export function DashboardButtonTooltip({
  children,
  disabled = false,
  label,
}: DashboardButtonTooltipProps) {
  return (
    <Tooltip
      py="0.6rem"
      px="0.75rem"
      bg="bg-black"
      offset={4}
      label={
        <Text c="inherit" size="sm" fw={700}>
          {label}
        </Text>
      }
      withArrow
      arrowSize={10}
      disabled={disabled}
    >
      <Box>{children}</Box>
    </Tooltip>
  );
}
