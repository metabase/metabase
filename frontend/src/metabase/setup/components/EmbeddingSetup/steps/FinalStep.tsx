import { Link } from "react-router";
import { useAsync } from "react-use";
import { t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
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
  const { url: docsUrl } = useDocsUrl("embedding/interactive-embedding");
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

  if (!dashboards || dashboards.length === 0) {
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

        <a href={docsUrl} target="_blank" rel="noreferrer">
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

      <Group justify="space-between" mt="xl">
        <Button component={Link} to="/" variant="subtle">
          {t`I'll do this later`}
        </Button>

        <Button component={Link} to="/setup/embedding/done" variant="filled">
          {t`I see Metabase`}
        </Button>
      </Group>
    </Stack>
  );
};
