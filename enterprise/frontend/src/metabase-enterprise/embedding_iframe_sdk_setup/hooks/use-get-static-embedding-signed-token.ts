import { useState } from "react";
import { useDeepCompareEffect } from "react-use";

import { useSetting } from "metabase/common/hooks";
import { getSignedToken } from "metabase/public/lib/embed";
import type { SdkIframeEmbedSetupContextType } from "metabase-enterprise/embedding_iframe_sdk_setup/context";
import { getResourceTypeFromExperience } from "metabase-enterprise/embedding_iframe_sdk_setup/utils/get-resource-type-from-experience";

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

  const [signedToken, setSignedToken] = useState<string | null>(null);

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
      const token = resourceType
        ? await getSignedToken(
            resourceType,
            settings.dashboardId ?? settings.questionId ?? "",
            previewParameterValuesBySlug,
            secretKey,
            embeddingParameters,
          )
        : "";

      setSignedToken(token);
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

  return { signedToken };
};
