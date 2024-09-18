import type { ReactNode } from "react";

import { Button, Group, Tooltip } from "metabase/ui";

export const ReactionBadge = ({
  left,
  right,
  tooltipLabel,
}: {
  left?: ReactNode;
  right?: ReactNode;
  tooltipLabel?: ReactNode | string;
}) => {
  return (
    <Tooltip disabled={!tooltipLabel} label={tooltipLabel}>
      <Button bg="bg-medium" px="sm" radius="xl" py="xs" compact>
        <Group spacing={0}>
          {left} {right}
        </Group>
      </Button>
    </Tooltip>
  );
};
