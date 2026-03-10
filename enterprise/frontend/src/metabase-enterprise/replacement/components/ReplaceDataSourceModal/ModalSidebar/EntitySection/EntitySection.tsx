import type { ReactNode } from "react";

import {
  Box,
  Card,
  FixedSizeIcon,
  Group,
  type IconName,
  Stack,
  Text,
} from "metabase/ui";

type EntitySectionProps = {
  icon: IconName;
  error?: string;
  children?: ReactNode;
};

export function EntitySection({ icon, error, children }: EntitySectionProps) {
  return (
    <Card px="md" py="lg" withBorder shadow="none">
      <Group align="start" wrap="nowrap">
        <Box p="sm" bg="background-brand" bdrs="md">
          <FixedSizeIcon c="brand" name={icon} />
        </Box>
        <Stack gap="sm">
          {children}
          {error && (
            <Text c="error" size="sm">
              {error}
            </Text>
          )}
        </Stack>
      </Group>
    </Card>
  );
}
