import type { ReactNode } from "react";

import { Button, type ButtonProps, Group, Tooltip } from "metabase/ui";

export const ReactionBadge = ({
  left,
  right,
  tooltipLabel,
  isSelected,
  ...buttonProps
}: {
  left?: ReactNode;
  right?: ReactNode;
  tooltipLabel?: ReactNode | string;
  isSelected: boolean;
} & Omit<ButtonProps, "left" | "right">) => (
  <Tooltip disabled={!tooltipLabel} label={tooltipLabel}>
    <Button
      bg={isSelected ? "focus" : "bg-medium"}
      px="12px"
      py="6px"
      radius="xl"
      compact
      c={isSelected ? "brand" : undefined}
      fw={isSelected ? "bold" : undefined}
      {...buttonProps}
    >
      <Group spacing={0}>
        {left} {right}
      </Group>
    </Button>
  </Tooltip>
);
