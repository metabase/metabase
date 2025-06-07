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

      <Tabs
        defaultValue={tabs[0].url}
        // TODO: keepMounted={true} would keep them "in memory" but it also loads them all at the same time,
        // slowing down the load of the first
      >
        <Tabs.List>
          {tabs.map((tab) => (
            <Tabs.Tab key={tab.url} value={tab.url}>
              {tab.title}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {tabs.map((tab) => (
          <Tabs.Panel key={tab.url} value={tab.url}>
            {/* This shows a loader while the iframe is loading, it's ugly as it's a different loader than the one inside the iframe,
            but some times the iframe takes a second or two to "start" and in that time there's just a big white space in the page */}
            <Box my="md" style={{ position: "relative" }}>
              <Center
                w="100%"
                style={{
                  position: "absolute",
                }}
                mt="xl"
              >
                <Loader />
              </Center>
              <iframe
                src={tab.url}
                style={{
                  width: "100%",
                  height: "600px",
                  border: "none",
                  zIndex: 2,
                  position: "relative",
                }}
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
