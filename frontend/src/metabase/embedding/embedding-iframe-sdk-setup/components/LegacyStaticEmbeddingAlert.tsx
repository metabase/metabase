import { c, t } from "ttag";

import { STATIC_LEGACY_EMBEDDING_TYPE } from "metabase/embedding/constants";
import type { LegacyStaticEmbeddingModalProps } from "metabase/embedding/embedding-iframe-sdk-setup/components/LegacyStaticEmbeddingModal";
import { useSdkIframeEmbedSetupContext } from "metabase/embedding/embedding-iframe-sdk-setup/context";
import { getResourceTypeFromExperience } from "metabase/embedding/embedding-iframe-sdk-setup/utils/get-resource-type-from-experience";
import { useDispatch } from "metabase/lib/redux";
import { setOpenModalWithProps } from "metabase/redux/ui";
import { Alert, Anchor, Box, Flex, Icon, Stack, Text } from "metabase/ui";

export const LegacyStaticEmbeddingAlert = () => {
  const { isGuestEmbedsEnabled, settings, resource, experience, onClose } =
    useSdkIframeEmbedSetupContext();

  const dispatch = useDispatch();

  const isGuestEmbed = !!settings.isGuest;
  const useExistingUserSession = !!settings.useExistingUserSession;

  const resourceType = getResourceTypeFromExperience(experience);
  const shouldShowForResource =
    resourceType === "dashboard" || resourceType === "question";

  if (
    !isGuestEmbedsEnabled ||
    !isGuestEmbed ||
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
          <Text c="text-primary" lh="lg">
            {t`This embed uses the legacy static embedding method. The controls shown are for the new embedding method, which is recommended.`}
          </Text>

          <Anchor
            key="anchor"
            fw="bold"
            lh="lg"
            data-testid="legacy-static-embedding-button"
            onClick={() => {
              onClose();

              const modalProps: LegacyStaticEmbeddingModalProps = {
                experience,
                dashboardId: settings.dashboardId,
                questionId: settings.questionId,
                parentInitialState: {
                  resourceId: resource.id,
                  resourceType,
                  isGuest: isGuestEmbed,
                  useExistingUserSession,
                },
              };

              dispatch(
                setOpenModalWithProps({
                  id: STATIC_LEGACY_EMBEDDING_TYPE,
                  props: modalProps,
                }),
              );
            }}
          >
            {c("A link that toggles the legacy static embedding wizard.")
              .t`Use legacy static embedding (not recommended)`}
          </Anchor>
        </Stack>
      </Flex>
    </Alert>
  );
};
