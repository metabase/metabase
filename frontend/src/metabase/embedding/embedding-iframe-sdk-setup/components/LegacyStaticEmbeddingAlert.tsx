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
    resource.enable_embedding && resource.embedding_type !== "guest-embed";

  if (!shouldShowLegacyStaticEmbeddingAlert) {
    return null;
  }

  return (
    <Alert color="info" variant="outline">
      <Flex gap="sm">
        <Box>
          <Icon color="text-secondary" name="info" mt="2px" />
        </Box>

        <Stack>
          <Text c="text-primary" lh="lg">
            {t`This embed was originally published with static embedding. We recommend using this new, modular embedding code snippet. Your embed won't change; you'll just have better theming options.`}
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
            {c("A link that toggles the static embedding wizard.")
              .t`Use static embedding instead`}
          </Anchor>
        </Stack>
      </Flex>
    </Alert>
  );
};
