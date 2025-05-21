import { t } from "ttag";

import { Box, Button, Stack, Text, Title } from "metabase/ui";

interface WelcomeStepProps {
  onNext: () => void;
}

export const WelcomeStep = ({ onNext }: WelcomeStepProps) => {
  return (
    <Stack gap="xl" align="center">
      <Title order={2}>{t`Welcome to Metabase Embedding`}</Title>

      <Stack gap="md" align="center">
        <Box ta="center">
          <Text size="lg">
            {t`Let's set up embedding for your application. We'll help you:`}
          </Text>
        </Box>

        <Stack gap="sm">
          <Text>• {t`Connect to your data`}</Text>
          <Text>• {t`Create models and X-rays automatically`}</Text>
          <Text>• {t`Set up JWT authentication`}</Text>
          <Text>• {t`Get a code snippet to embed in your app`}</Text>
        </Stack>
      </Stack>

      <Button size="lg" onClick={onNext}>
        {t`Let's get started`}
      </Button>
    </Stack>
  );
};
