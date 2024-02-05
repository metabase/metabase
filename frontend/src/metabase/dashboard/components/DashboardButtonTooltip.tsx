import type { ReactNode } from "react";
import { Text, Tooltip } from "metabase/ui";

type DashboardButtonTooltipProps = {
  children: ReactNode;
  label: string;
};

export function DashboardButtonTooltip({
  children,
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
    >
      {children}
    </Tooltip>
  );
}
