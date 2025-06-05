import { useMemo } from "react";
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

  const getEmbedCode = (url: string) => {
    return `<iframe src="${url}" />`;
  };

  const tabs = useMemo(
    () => [
      ...(dashboards ?? []).map((dashboard) => ({
        title: dashboard.name,
        url: `${window.location.origin}/embed/dashboard/${dashboard.id}`,
      })),
      {
        title: t`Query Builder`,
        url: `${window.location.origin}/question/new`,
      },
    ],
    [dashboards],
  );

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

      <Tabs defaultValue={tabs[0].url}>
        <Tabs.List>
          {tabs.map((tab) => (
            <Tabs.Tab key={tab.url} value={tab.url}>
              {tab.title}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {tabs.map((tab) => (
          <Tabs.Panel key={tab.url} value={tab.url}>
            <Box my="md">
              <iframe
                src={tab.url}
                style={{ width: "100%", height: "600px", border: "none" }}
                title={tab.title}
              />
            </Box>

            <CodeSnippet code={getEmbedCode(tab.url)} />
          </Tabs.Panel>
        ))}
      </Tabs>

      <Group justify="space-between" mt="xl">
        <Button component={Link} to="/" variant="subtle" color="text-primary">
          {t`I'll do this later`}
        </Button>

        <Button component={Link} to="/setup/embedding/done" variant="filled">
          {t`I see Metabase`}
        </Button>
      </Group>
    </Stack>
  );
};
