import { useMemo, useState } from "react";
import { useDeepCompareEffect } from "react-use";

import { useSetting } from "metabase/common/hooks";
import { checkNotNull } from "metabase/lib/types";
import { getPreviewParamsBySlug } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/lib/get-preview-params-by-slug";
import { getSignedToken } from "metabase/public/lib/embed";
import { useParameters } from "metabase-enterprise/embedding_iframe_sdk_setup/components/ParameterSettings/hooks/use-parameters";
import { useSdkIframeEmbedSetupContext } from "metabase-enterprise/embedding_iframe_sdk_setup/context";
import { getResourceTypeFromExperience } from "metabase-enterprise/embedding_iframe_sdk_setup/utils/get-resource-type-from-experience";

export const useGetStaticEmbeddingPreviewSignedToken = () => {
  const siteUrl = useSetting("site-url");
  const secretKey = checkNotNull(useSetting("embedding-secret-key"));

  const [signedToken, setSignedToken] = useState("");

  const { settings, experience, availableParameters, embeddingParameters } =
    useSdkIframeEmbedSetupContext();

  const { parameterValuesById: parameterValues } = useParameters();

  const previewParamsBySlug = useMemo(
    () =>
      getPreviewParamsBySlug({
        resourceParameters: availableParameters,
        embeddingParams: embeddingParameters,
        parameterValues,
      }),
    [availableParameters, embeddingParameters, parameterValues],
  );

  useDeepCompareEffect(() => {
    const generate = async () => {
      const resourceType = getResourceTypeFromExperience(experience);
      const token = resourceType
        ? await getSignedToken(
            resourceType,
            settings.dashboardId ?? settings.questionId ?? "",
            previewParamsBySlug,
            secretKey,
            embeddingParameters,
          )
        : "";

      setSignedToken(token);
    };

    generate();
  }, [
    siteUrl,
    previewParamsBySlug,
    experience,
    settings.dashboardId,
    settings.questionId,
    secretKey,
    embeddingParameters,
  ]);

  return { signedToken };
};
