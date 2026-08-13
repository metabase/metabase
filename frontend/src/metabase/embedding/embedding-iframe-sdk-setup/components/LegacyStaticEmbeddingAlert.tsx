import { c, t } from "ttag";

import { STATIC_LEGACY_EMBEDDING_TYPE } from "metabase/embedding/constants";
import { useSdkIframeEmbedSetupContext } from "metabase/embedding/embedding-iframe-sdk-setup/context";
import { getResourceTypeFromExperience } from "metabase/embedding/embedding-iframe-sdk-setup/utils/get-resource-type-from-experience";
import { useDispatch } from "metabase/redux";
import { setOpenModalWithProps } from "metabase/redux/ui";
import { Alert, Anchor, Icon } from "metabase/ui";

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
    <Alert size="compact" variant="light" icon={<Icon name="info" />}>
      {t`This embed was originally published with static embedding. We recommend using this new, modular embedding code snippet. Your embed won't change; you'll just have better theming options.`}
      <Anchor
        key="anchor"
        fw="bold"
        data-testid="legacy-static-embedding-button"
        onClick={() => {
          onClose();

          dispatch(
            setOpenModalWithProps({
              id: STATIC_LEGACY_EMBEDDING_TYPE,
              props: {
                experience,
                dashboardId: settings.dashboardId,
                questionId: settings.questionId,
                parentInitialState: {
                  resourceId: resource.id,
                  resourceType,
                  isGuest: isGuestEmbed,
                  useExistingUserSession,
                },
              },
            }),
          );
        }}
      >
        {c("A link that toggles the static embedding wizard.")
          .t`Use static embedding instead`}
      </Anchor>
    </Alert>
  );
};
