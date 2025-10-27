import { c, t } from "ttag";

import { Alert, Anchor, Box, Flex, Icon, Stack, Text } from "metabase/ui";
import { useSdkIframeEmbedSetupContext } from "metabase-enterprise/embedding_iframe_sdk_setup/context";
import { getResourceTypeFromExperience } from "metabase-enterprise/embedding_iframe_sdk_setup/utils/get-resource-type-from-experience";

export const LegacyStaticEmbeddingAlert = () => {
  const { settings, resource, experience } = useSdkIframeEmbedSetupContext();

  const isStaticEmbedding = !!settings.isStatic;

  const resourceType = getResourceTypeFromExperience(experience);
  const shouldShowForResource =
    resourceType === "dashboard" || resourceType === "question";

  if (
    !isStaticEmbedding ||
    !resource ||
    !resourceType ||
    !shouldShowForResource
  ) {
    return null;
  }

  const shouldShowLegacyStaticEmbeddingAlert =
    resource.enable_embedding && resource.embedding_type === "static-legacy";

  if (!shouldShowLegacyStaticEmbeddingAlert) {
    return null;
  }

  return (
    <Alert color="info" variant="outline">
      <Flex gap="sm">
        <Box>
          <Icon color="var(--mb-color-text-secondary)" name="info" mt="2px" />
        </Box>

        <Stack>
          {c(
            "{0} is the legacy static embedding usage alert when opening a modern static embedding wizard. {1} is the link that enables legacy static embedding wizard",
          ).jt`${(
            <Text key="legacy-static-embedding-alert" c="text-primary" lh="lg">
              {t`This embed uses the legacy static embedding method. The controls shown are for the new embedding method, which is recommended.`}
            </Text>
          )}${(
            <Anchor key="anchor" fw="bold" lh="lg">
              {t`Use legacy static embedding (not recommended)`}
            </Anchor>
          )}`}
        </Stack>
      </Flex>
    </Alert>
  );
};
