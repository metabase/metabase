import { c } from "ttag";

import { Stack, Text, Title } from "metabase/ui";

export const OnboardingDismissedToast = () => {
  return (
    <Stack spacing="xs">
      <Title order={4} color="white" fw={700}>{c(
        "Notification that shows after the user hides the page",
      ).t`Page hidden from the navigation sidebar`}</Title>
      <Text color="white">{c(
        "Refers to the Onboarding page that has been hidden from the navigation sidebar",
      )
        .t`Access it later anytime by clicking the gear icon at the top right of the screen.`}</Text>
    </Stack>
  );
};
