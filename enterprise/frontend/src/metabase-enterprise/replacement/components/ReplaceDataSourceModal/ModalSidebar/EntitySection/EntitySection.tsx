import type { ReactNode } from "react";

import { Box, Card, FixedSizeIcon, Group, type IconName } from "metabase/ui";

type EntitySectionProps = {
  icon: IconName;
  children?: ReactNode;
};

export function EntitySection({ icon, children }: EntitySectionProps) {
  return (
    <Card px="md" py="lg" withBorder shadow="none">
      <Group wrap="nowrap">
        <Box p="sm" bg="background-brand" bdrs="md">
          <FixedSizeIcon c="brand" name={icon} />
        </Box>
        {children}
      </Group>
    </Card>
  );
}
