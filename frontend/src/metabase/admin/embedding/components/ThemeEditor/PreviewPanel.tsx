import { useState } from "react";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import { Box, Center, Flex, Loader, Text } from "metabase/ui";

import { EnableEmbeddingPrompt } from "./EnableEmbeddingPrompt";
import { PreviewResourcePicker } from "./PreviewResourcePicker";
import { ResourcePreview } from "./ResourcePreview";
import type { PreviewResource } from "./types";
import { useDefaultPreviewResource } from "./use-default-preview-resource";

export function PreviewPanel({ settings }: { settings: MetabaseTheme }) {
  const isSimpleEmbeddingEnabled = useSetting("enable-embedding-simple");
  const isTermsAccepted = !useSetting("show-simple-embed-terms");

  const isEmbeddingReady = isSimpleEmbeddingEnabled && isTermsAccepted;

  const [selectedResource, setSelectedResource] =
    useState<PreviewResource | null>(null);
  const { resource: defaultResource, isLoading: isDefaultResourceLoading } =
    useDefaultPreviewResource();

  const resource = selectedResource ?? defaultResource;

  return (
    <Flex direction="column" flex={1} bg="background-secondary">
      <Box p="xl" pb="sm">
        <Flex align="center" justify="space-between" gap="md">
          <Text fw={700} fz="xl">{t`Theme preview`}</Text>
          {isEmbeddingReady && resource && (
            <PreviewResourcePicker
              resource={resource}
              onChange={setSelectedResource}
            />
          )}
        </Flex>
      </Box>
      <Box flex={1} p="xl" pt="sm" style={{ overflow: "hidden" }}>
        {!isEmbeddingReady ? (
          <EnableEmbeddingPrompt
            isEnabled={isSimpleEmbeddingEnabled}
            isTermsAccepted={isTermsAccepted}
          />
        ) : isDefaultResourceLoading ? (
          <Center h="100%">
            <Loader />
          </Center>
        ) : resource ? (
          <ResourcePreview theme={settings} resource={resource} />
        ) : (
          <Center h="100%">
            <Text c="text-secondary">
              {t`Create a dashboard or question to preview this theme.`}
            </Text>
          </Center>
        )}
      </Box>
    </Flex>
  );
}
