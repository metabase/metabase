import { t } from "ttag";

import { Box, Stack, Text, Title } from "metabase/ui";

export const DatabaseReplicationSettingUp = () => (
  <Stack align="center" my="4.5rem">
    <Box h={96} w={96}>
      <img src="app/assets/img/metabot-cloud-96x96.svg" alt="Metabot Cloud" />
    </Box>

    <Stack align="center">
      <Title>{t`Setting up, please wait`}</Title>
      <Text>{t`This will take just a minute or so`}</Text>
    </Stack>
  </Stack>
);
