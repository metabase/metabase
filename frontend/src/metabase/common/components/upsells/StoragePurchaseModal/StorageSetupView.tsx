import { t } from "ttag";

import { Box, Flex, Loader, Stack, Text, Title } from "metabase/ui";

import databaseAdd from "./database-add.svg?component";

const StorageIcon = () => (
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
      <Loader size="xs" ml={1} mt={1} />
    </Flex>
  </Box>
);

export const StorageSetupView = () => (
  <Stack align="center" justify="center" gap="lg" h="100%">
    <StorageIcon />

    <Box ta="center">
      <Title c="text-primary" fz="lg">
        {t`Setting up storage`}
      </Title>
      <Text c="text-secondary" fz="md" lh={1.43}>
        {t`This can take a few minutes.`}
      </Text>
    </Box>
  </Stack>
);
