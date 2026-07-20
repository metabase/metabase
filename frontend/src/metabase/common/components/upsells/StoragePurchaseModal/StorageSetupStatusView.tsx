import type { ReactNode } from "react";

import { Box, Flex, Stack, Text, Title } from "metabase/ui";

import databaseAdd from "./database-add.svg?component";

interface StorageSetupStatusViewProps {
  /** Rendered inside the circular badge overlaying the illustration. */
  badge: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export const StorageSetupStatusView = ({
  badge,
  title,
  description,
  action,
}: StorageSetupStatusViewProps) => (
  <Stack align="center" justify="center" gap="lg" h="100%">
    <Box h={96} pos="relative" w={96}>
      <Box component={databaseAdd} />

      <Flex
        bottom={0}
        align="center"
        direction="row"
        gap={0}
        justify="center"
        pos="absolute"
        right={0}
        wrap="nowrap"
        bg="white"
        fz={0}
        p="sm"
        ta="center"
        style={{
          borderRadius: "100%",
          boxShadow: `0 1px 6px 0 var(--mb-color-shadow)`,
        }}
      >
        {badge}
      </Flex>
    </Box>

    <Box ta="center">
      <Title c="text-primary" fz="lg">
        {title}
      </Title>
      <Text c="text-secondary" fz="md" lh={1.43}>
        {description}
      </Text>
    </Box>

    {action}
  </Stack>
);
