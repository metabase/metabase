import { Link } from "react-router";
import { t } from "ttag";

import { Box, Button, List, Space, Text, Title } from "metabase/ui";

import type { StepProps } from "../steps/embeddingSetupSteps";
import { useForceLocaleRefresh } from "../useForceLocaleRefresh";

export const WelcomeStep = ({ nextStep }: StepProps) => {
  useForceLocaleRefresh();

  return (
    <Box p="2xl" style={{ borderRadius: 16 }} my="xxl" bg="white">
      <Title order={2} mb="lg">
        {t`Welcome to Metabase`}
      </Title>
      <Title order={2} mb="lg">
        {t`Let's get you up and running with a starting setup for embedded analytics`}
      </Title>

      <Text size="lg" mb="md">
        {t`You'll get to add working starter content to your app based on your real data.`}
      </Text>
      <Text size="lg" mb="md">
        {t`This will give you a solid base to customize and keep building off of on your way to production.`}
      </Text>

      <Space h="xl" />

      <Text size="lg" mb="xs">{t`Requirements:`}</Text>
      <Box mb="xl" pl="lg" style={{ paddingLeft: 24 }}>
        <List size="lg">
          <List.Item>
            {t`Access to your app or a sample app you want to use to experiment`}
          </List.Item>
        </List>
      </Box>

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
