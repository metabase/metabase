import { t } from "ttag";

import { Box, Flex, Loader, Stack, Text, Title } from "metabase/ui";

export const DatabaseReplicationSettingUp = () => (
  <Stack align="center" gap="lg" my="6rem">
    <Box h={96} pos="relative" w={96}>
      <img src="app/assets/img/metabot-cloud-96x96.svg" alt="Metabot Cloud" />

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
          // eslint-disable-next-line no-color-literals
          boxShadow: `0 0 0 1px rgba(0, 0, 0, 0.05), 0 1px 6px 0 rgba(0, 0, 0, 0.10)`,
        }}
      >
        <Loader size="xs" ml={1} mt={1} />
      </Flex>
    </Box>

    <Box ta="center">
      <Title c="text-primary" fz="lg">{t`Setting up, please wait`}</Title>
      <Text
        c="text-secondary"
        fz="md"
        lh={1.43}
        maw={380}
      >{t`This will take just a minute or so`}</Text>
    </Box>
  </Stack>
);
