import { t } from "ttag";

import { Box, Loader, Stack, Text, Title } from "metabase/ui";

interface ProcessingStepProps {
  status: string;
}

export const ProcessingStep = ({ status }: ProcessingStepProps) => {
  return (
    <Stack gap="xl" align="center">
      <Title order={2}>{t`Setting up your embedding`}</Title>

      <Box ta="center">
        <Loader size="lg" mb="md" />
        <Text size="lg">{status}</Text>
      </Box>
    </Stack>
  );
};
