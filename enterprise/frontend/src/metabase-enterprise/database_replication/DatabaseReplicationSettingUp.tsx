import { t } from "ttag";

import { MetabotLogo } from "metabase/common/components/MetabotLogo";
import { Box, Flex, Loader, Stack, Text, Title } from "metabase/ui";

export const DatabaseReplicationSettingUp = () => (
  <Stack align="center" gap="lg" my="4.5rem">
    <Box h={96} pos="relative" w={96}>
      <MetabotLogo variant="cloud" alt={t`Metabot Cloud`} />
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

    <Box ta="center">
      <Title c="text-primary" fz="lg">{t`Setting up, please wait`}</Title>
      <Text
        c="text-secondary"
        fz="md"
        lh="1.25rem"
      >{t`This will take just a minute or so`}</Text>
    </Box>
  </Stack>
);
