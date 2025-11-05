import { useState } from "react";
import { useDeepCompareEffect } from "react-use";

import { useSetting } from "metabase/common/hooks";
import { getSignedToken } from "metabase/public/lib/embed";
import type { SdkIframeEmbedSetupContextType } from "metabase-enterprise/embedding_iframe_sdk_setup/context";
import { getResourceTypeFromExperience } from "metabase-enterprise/embedding_iframe_sdk_setup/utils/get-resource-type-from-experience";

const SIGNED_TOKEN_FOR_SNIPPET_EXPIRATION_MINUTES = 10;
const SIGNED_TOKEN_FOR_PREVIEW_EXPIRATION_MINUTES = 60;

export const useGetStaticEmbeddingSignedToken = ({
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

  const isStaticEmbedding = !!settings.isStatic;
  const isQuestionOrDashboard =
    (experience === "dashboard" && settings.dashboardId) ||
    (experience === "chart" && settings.questionId);

  useDeepCompareEffect(() => {
    if (!isStaticEmbedding || !isQuestionOrDashboard || !secretKey) {
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
    isStaticEmbedding,
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
