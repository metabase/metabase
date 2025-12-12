import { useState } from "react";
import { useDeepCompareEffect } from "react-use";

import { useSetting } from "metabase/common/hooks";
import type { SdkIframeEmbedSetupContextType } from "metabase/embedding/embedding-iframe-sdk-setup/context";
import { getResourceTypeFromExperience } from "metabase/embedding/embedding-iframe-sdk-setup/utils/get-resource-type-from-experience";
import { isQuestionOrDashboardSettings } from "metabase/embedding/embedding-iframe-sdk-setup/utils/is-question-or-dashboard-settings";
import { getSignedToken } from "metabase/public/lib/embed";

const SIGNED_TOKEN_FOR_SNIPPET_EXPIRATION_MINUTES = 10;
const SIGNED_TOKEN_FOR_PREVIEW_EXPIRATION_MINUTES = 60;

export const useGetGuestEmbedSignedToken = ({
  settings,
  experience,
  previewParameterValuesBySlug,
  embeddingParameters,
}: Pick<
  SdkIframeEmbedSetupContextType,
  | "settings"
  | "experience"
  | "previewParameterValuesBySlug"
  | "embeddingParameters"
>) => {
  const secretKey = useSetting("embedding-secret-key");

  const [{ signedTokenForSnippet, signedTokenForPreview }, setSignedTokens] =
    useState<{
      signedTokenForSnippet: string | null;
      signedTokenForPreview: string | null;
    }>({
      signedTokenForSnippet: null,
      signedTokenForPreview: null,
    });

  const isGuestEmbed = !!settings.isGuest;
  const isQuestionOrDashboard = isQuestionOrDashboardSettings(
    experience,
    settings,
  );

  useDeepCompareEffect(() => {
    if (!isGuestEmbed || !isQuestionOrDashboard || !secretKey) {
      return;
    }

    const generate = async () => {
      const resourceType = getResourceTypeFromExperience(experience);

      const signedTokenForSnippet = resourceType
        ? await getSignedToken(
            resourceType,
            settings.dashboardId ?? settings.questionId ?? "",
            previewParameterValuesBySlug,
            secretKey,
            embeddingParameters,
            SIGNED_TOKEN_FOR_SNIPPET_EXPIRATION_MINUTES,
          )
        : "";
      const signedTokenForPreview = resourceType
        ? await getSignedToken(
            resourceType,
            settings.dashboardId ?? settings.questionId ?? "",
            previewParameterValuesBySlug,
            secretKey,
            embeddingParameters,
            SIGNED_TOKEN_FOR_PREVIEW_EXPIRATION_MINUTES,
          )
        : "";

      setSignedTokens({
        signedTokenForSnippet,
        signedTokenForPreview,
      });
    };

    generate();
  }, [
    isGuestEmbed,
    isQuestionOrDashboard,
    previewParameterValuesBySlug,
    experience,
    settings.dashboardId,
    settings.questionId,
    secretKey,
    embeddingParameters,
  ]);

  return { signedTokenForSnippet, signedTokenForPreview };
};
