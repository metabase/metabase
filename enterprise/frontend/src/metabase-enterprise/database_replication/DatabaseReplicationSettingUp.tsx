import { t } from "ttag";

import { Box, Loader, Stack, Text, Title } from "metabase/ui";

export const DatabaseReplicationSettingUp = () => (
  <Stack align="center" gap="lg" my="6rem">
    <Box h={96} pos="relative" w={96}>
      <img src="app/assets/img/metabot-cloud-96x96.svg" alt="Metabot Cloud" />

      <Box bottom={0} pos="absolute" right={0}>
        <Loader size={32} />
      </Box>
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
