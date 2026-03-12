import { t } from "ttag";

import { MetabotLogo } from "metabase/common/components/MetabotLogo";
import { Box, Button, Stack, Text, Title } from "metabase/ui";

export const DatabaseReplicationSuccess = ({
  onClose,
}: {
  onClose: () => void;
}) => {
  return (
    <Stack align="center" gap="lg" my="4.5rem">
      <Box h={96} w={96}>
        <MetabotLogo variant="cloud" />
      </Box>

      <Box ta="center">
        <Title c="text-primary" fz="lg">{t`Replication in progress`}</Title>
        <Text c="text-secondary" fz="md" lh="1.25rem">
          {t`The process runs in the background. Depending on the database size, this can take up to several hours. You will get an email once your data is ready to use.`}
        </Text>
      </Box>

      <Button onClick={onClose} size="md" variant="filled" miw="30%">
        {t`Done`}
      </Button>
    </Stack>
  );
};
