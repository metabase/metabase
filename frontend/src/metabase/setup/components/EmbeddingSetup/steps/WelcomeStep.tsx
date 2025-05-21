import { Link } from "react-router";
import { t } from "ttag";

import { Box, Button, Text } from "metabase/ui";

export const WelcomeStep = () => {
  return (
    <Box>
      <Text size="xl" fw="bold" mb="md">
        {t`Welcome to Embedding Setup`}
      </Text>
      <Text mb="xl">
        {t`Let's get your database connected and set up embedding for your application.`}
      </Text>
      <Button
        component={Link}
        to="/setup/embedding/data-connection"
        variant="filled"
      >
        {t`Get Started`}
      </Button>
    </Box>
  );
};
