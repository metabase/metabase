import { Link } from "react-router";
import { c, t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";
import { Box, Button, List, Space, Text, Title } from "metabase/ui";

export const WelcomeStep = () => {
  const user = useSelector(getUser);

  return (
    <Box
      p="2xl"
      style={{ borderRadius: 16, boxShadow: "var(--shadow-md)" }}
      my="xxl"
      bg="white"
    >
      <Title order={2} mb="lg">
        {c("{0} is the first name of the logged in user")
          .t`Howdy, ${user?.first_name}`}
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

      <Button
        component={Link}
        to="/setup/embedding/data-connection"
        variant="filled"
        mb="md"
        miw={"12rem"}
      >
        {t`Start`}
      </Button>

      <Space h="lg" />

      <Text>
        <Link to="/" style={{ color: "#888" }}>{t`Set up manually`}</Link>
      </Text>
    </Box>
  );
};
