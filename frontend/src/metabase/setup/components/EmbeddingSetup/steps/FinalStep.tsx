import { Link } from "react-router";
import { useAsync } from "react-use";
import { t } from "ttag";

import { CodeSnippet } from "metabase/components/CodeSnippet";
import {
  Box,
  Button,
  Center,
  Group,
  Loader,
  Stack,
  Tabs,
  Text,
  Title,
} from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

import { useEmbeddingSetup } from "../EmbeddingSetupContext";

export const FinalStep = () => {
  const { createdDashboardIds } = useEmbeddingSetup();

  const { loading, value: dashboards } = useAsync(async () => {
    const dashboardPromises = createdDashboardIds.map((id) =>
      fetch(`/api/dashboard/${id}`).then((res) => res.json()),
    );
    return Promise.all(dashboardPromises);
  }, [createdDashboardIds]);

  const getEmbedCode = (dashboard: Dashboard) => {
    return `<iframe src="${window.location.origin}/embed/dashboard/${dashboard.id}" />`;
  };

  if (loading) {
    return (
      <Center h="500px">
        <Loader size="lg" />
      </Center>
    );
  }

  if (!dashboards) {
    return (
      <Center h="500px">
        <Text>{t`No dashboards found`}</Text>
      </Center>
    );
  }

  return (
    <Stack gap="xl">
      <Group justify="space-between">
        <Stack gap="md">
          <Title order={2}>{t`Add to your app`}</Title>
          <Text size="md">
            {t`Copy the code into your application. You can also pick this up later.`}
          </Text>
        </Stack>
        {/* TODO() DOCS URL */}
        <a href={""} target="_blank" rel="noreferrer">
          <Text c="brand">{t`Documentation`}</Text>
        </a>
      </Group>

      <Tabs defaultValue={dashboards[0].id.toString()}>
        <Tabs.List>
          {dashboards.map((dashboard) => (
            <Tabs.Tab key={dashboard.id} value={dashboard.id.toString()}>
              {dashboard.name}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {dashboards.map((dashboard) => (
          <Tabs.Panel key={dashboard.id} value={dashboard.id.toString()}>
            <Box my="md">
              <iframe
                src={`${window.location.origin}/embed/dashboard/${dashboard.id}`}
                style={{ width: "100%", height: "600px", border: "none" }}
                title={dashboard.name}
              />
            </Box>

            <CodeSnippet code={getEmbedCode(dashboard)} language="html" />
          </Tabs.Panel>
        ))}
      </Tabs>

      <Title order={2}>{t`How'd it go?`}</Title>
      <Button component={Link} to="/" size="lg" variant="filled" w="100%">
        {t`I see my dashboard in my app`}
      </Button>
      <Button
        component={Link}
        to="https://metabase.com/docs/latest/embedding/embedding-guide"
        size="lg"
        variant="outline"
        w="100%"
      >
        {t`I'm hitting issues`}
      </Button>
    </Stack>
  );
};
