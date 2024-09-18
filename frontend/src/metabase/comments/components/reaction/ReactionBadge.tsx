import type { ReactNode } from "react";

import { Button, type ButtonProps, Group, Tooltip } from "metabase/ui";

export const ReactionBadge = ({
  left,
  right,
  tooltipLabel,
  ...buttonProps
}: {
  left?: ReactNode;
  right?: ReactNode;
  tooltipLabel?: ReactNode | string;
} & Omit<ButtonProps, "left" | "right">) => {
  return (
    <Tooltip disabled={!tooltipLabel} label={tooltipLabel}>
      <Button
        bg="bg-medium"
        px="sm"
        radius="xl"
        py="xs"
        compact
        {...buttonProps}
      >
        <Group spacing={0}>
          {left} {right}
        </Group>
      </Button>
    </Tooltip>
  );
};
