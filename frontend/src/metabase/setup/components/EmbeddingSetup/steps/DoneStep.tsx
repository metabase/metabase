import { Link } from "react-router";
import { t } from "ttag";

import { Anchor, Box, Button, Stack, Text } from "metabase/ui";

export const DoneStep = () => {
  return (
    <Box>
      <Text size="xl" fw="bold" mb="md">
        {t`You're on your way!`}
      </Text>
      <Text mb="lg">
        {t`Now that you have data and some content added to your app, you're set up to go further.`}
      </Text>
      <Stack gap="xs" mb="lg">
        {/* TODO: where should these links go? */}
        <Anchor href="#" c="brand" style={{ display: "block" }}>
          {t`Theme your embedded content`}
        </Anchor>
        <Anchor href="#" c="brand" style={{ display: "block" }}>
          {t`Set up data sandboxing`}
        </Anchor>
      </Stack>
      <Text mb="xl">
        {t`We'll continue to help you out with all of those steps and in the main app you'll be able to start building our more realistic content.`}
      </Text>
      <Button component={Link} to="/" variant="filled">
        {t`Take me to Metabase`}
      </Button>
    </Box>
  );
};
