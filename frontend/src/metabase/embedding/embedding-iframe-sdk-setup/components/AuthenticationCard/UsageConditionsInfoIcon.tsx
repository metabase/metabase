import type { ReactNode } from "react";

import { HoverCard, Icon, Stack } from "metabase/ui";

/**
 * Small info icon with a hover-card, used by both enable sections to surface
 * per-embedding-type caveats next to the "agree to usage conditions" copy. The
 * caller passes the actual tooltip body as `children`.
 */
export const UsageConditionsInfoIcon = ({
  children,
}: {
  children: ReactNode;
}) => (
  <HoverCard position="bottom" withArrow>
    <HoverCard.Target>
      <Icon
        name="info"
        size={14}
        c="text-secondary"
        ml="sm"
        style={{ verticalAlign: "middle" }}
      />
    </HoverCard.Target>

    <HoverCard.Dropdown>
      <Stack maw={340} p="md" gap="md">
        {children}
      </Stack>
    </HoverCard.Dropdown>
  </HoverCard>
);
