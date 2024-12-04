import { t } from "ttag";

import { Stack, Text, Title } from "metabase/ui";

export const OnboardingDismissedToast = () => {
  return (
    <Stack spacing="xs">
      <Title
        order={4}
        color="white"
        fw={700}
      >{t`Page hidden from the navigation sidebar`}</Title>
      <Text color="white">{t`Access it later anytime by clicking the gear icon at the top right of the screen.`}</Text>
    </Stack>
  );
};
