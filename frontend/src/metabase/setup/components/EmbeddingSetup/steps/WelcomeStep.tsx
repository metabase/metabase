import { Link } from "react-router";
import { t } from "ttag";

import { Box, Button, Space, Text, Title } from "metabase/ui";

import type { StepProps } from "../steps/embeddingSetupSteps";

export const WelcomeStep = ({ nextStep }: StepProps) => {
  return (
    <Box p="xl" style={{ borderRadius: 16 }} bg="white">
      <Title order={2} mb="lg">
        {t`Welcome to Metabase`}
      </Title>

      <Text size="lg" mb="md">
        {t`Let's get you up and running with a starting setup for embedded analytics. You'll get to add working starter content to your app based on your real data. This will give you a solid base to customize and keep building off of on your way to production.`}
      </Text>

      <Space h="xl" />

      <Title order={5} mb="xs">{t`Requirements:`}</Title>
      <Text size="lg">
        {t`Access to your app or a sample app you want to use to experiment.`}
      </Text>

      <Space h="xl" />

      <Button onClick={nextStep} variant="filled" mb="md" miw={"12rem"}>
        {t`Start`}
      </Button>

      <Space h="lg" />

      <Text>
        <Link to="/" style={{ color: "#888" }}>{t`Set up manually`}</Link>
      </Text>
    </Box>
  );
};
