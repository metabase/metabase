import { t } from "ttag";

import { Box, Stack, Text, Title } from "metabase/ui";

export const DatabaseReplicationSettingUp = () => (
  <Stack align="center" my="6rem">
    <Box h={96} w={96}>
      <img src="app/assets/img/metabot-cloud-96x96.svg" alt="Metabot Cloud" />
    </Box>

    <Stack align="center">
      <Title c="text-primary" fz="lg">{t`Setting up, please wait`}</Title>
      <Text
        c="text-secondary"
        fz="md"
      >{t`This will take just a minute or so`}</Text>
    </Stack>
  </Stack>
);
