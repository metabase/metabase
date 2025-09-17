import { useMemo } from "react";
import { t } from "ttag";

import { CopyButton } from "metabase/common/components/CopyButton";
import { useDocsUrl } from "metabase/common/hooks";
import { highlight } from "metabase/query_builder/components/expressions/HighlightExpression/utils";
import {
  Box,
  Button,
  Center,
  Code,
  Group,
  Loader,
  Stack,
  Tabs,
  Text,
  Title,
} from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

import { useEmbeddingSetup } from "../EmbeddingSetupContext";

import type { StepProps } from "./embeddingSetupSteps";

export const FinalStep = ({ nextStep }: StepProps) => {
  const { url: docsUrl } = useDocsUrl("embedding/interactive-embedding");
  const { createdDashboard2, trackEmbeddingSetupClick } = useEmbeddingSetup();

  const getEmbedCode = (url: string) => {
    return `<iframe src="${url}" width="800px" height="500px" />`;
  };

  const tabs = useMemo(
    () => [
      ...createdDashboard2.map((dashboard: Dashboard) => ({
        title: dashboard.name,
        url: `${window.location.origin}/dashboard/${dashboard.id}`,
      })),
      {
        title: t`Query Builder`,
        url: `${window.location.origin}/question/new`,
      },
    ],
    [createdDashboard2],
  );

  if (!createdDashboard2 || createdDashboard2.length === 0) {
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
            <Box mt="md">
              <CodeSnippet
                code={getEmbedCode(tab.url)}
                onCopy={() => {
                  trackEmbeddingSetupClick("snippet-copied");
                }}
              />
            </Box>

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
          </Tabs.Panel>
        ))}
      </Tabs>

      <Group justify="space-between" mt="xl">
        <Button
          variant="subtle"
          color="text-primary"
          onClick={() => {
            trackEmbeddingSetupClick("ill-do-this-later");
            nextStep();
          }}
        >
          {t`I'll do this later`}
        </Button>

        <Button variant="filled" onClick={nextStep}>
          {t`I see Metabase`}
        </Button>
      </Group>
    </Stack>
  );
};

export const CodeSnippet = ({
  code,
  onCopy,
}: {
  code: string;
  onCopy?: () => void;
}) => {
  return (
    <Group
      px="lg"
      py="md"
      bd="1px solid border"
      bg="bg-light"
      w="100%"
      style={{
        borderRadius: 8,
      }}
    >
      <Code flex={1} dangerouslySetInnerHTML={{ __html: highlight(code) }} />
      <CopyButton value={code} onCopy={onCopy} />
    </Group>
  );
};
