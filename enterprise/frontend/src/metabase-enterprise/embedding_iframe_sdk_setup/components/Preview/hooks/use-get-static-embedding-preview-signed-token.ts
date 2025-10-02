import { useMemo, useState } from "react";
import { useDeepCompareEffect } from "react-use";

import { useSetting } from "metabase/common/hooks";
import { checkNotNull } from "metabase/lib/types";
import { getPreviewParamsBySlug } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/lib/get-preview-params-by-slug";
import { getSignedToken } from "metabase/public/lib/embed";
import { useParameters } from "metabase-enterprise/embedding_iframe_sdk_setup/components/ParameterSettings/hooks/use-parameters";
import { useStaticEmbeddingParameters } from "metabase-enterprise/embedding_iframe_sdk_setup/components/ParameterSettings/hooks/use-static-embedding-paramers";
import { useSdkIframeEmbedSetupContext } from "metabase-enterprise/embedding_iframe_sdk_setup/context";
import { getStaticEmbeddingResourceType } from "metabase-enterprise/embedding_iframe_sdk_setup/utils/get-static-embedding-resource-type";

export const useGetStaticEmbeddingPreviewSignedToken = () => {
  const siteUrl = useSetting("site-url");
  const secretKey = checkNotNull(useSetting("embedding-secret-key"));

  const [signedToken, setSignedToken] = useState("");

  const { settings, availableParameters } = useSdkIframeEmbedSetupContext();

  const { parameterValuesById: parameterValues } = useParameters();
  const { buildEmbeddedParameters } = useStaticEmbeddingParameters();

  const resourceType = getStaticEmbeddingResourceType(settings);
  const embeddingParams = useMemo(
    () => buildEmbeddedParameters(availableParameters),
    [availableParameters, buildEmbeddedParameters],
  );

  const previewParamsBySlug = useMemo(
    () =>
      getPreviewParamsBySlug({
        resourceParameters: availableParameters,
        embeddingParams,
        parameterValues,
      }),
    [availableParameters, embeddingParams, parameterValues],
  );

  useDeepCompareEffect(() => {
    const generate = async () => {
      const token = resourceType
        ? await getSignedToken(
            resourceType,
            settings.dashboardId ?? settings.questionId ?? "",
            previewParamsBySlug,
            secretKey,
            embeddingParams,
          )
        : "";

      setSignedToken(token);
    };

    generate();
  }, [
    siteUrl,
    previewParamsBySlug,
    resourceType,
    settings.dashboardId,
    settings.questionId,
    secretKey,
    embeddingParams,
  ]);

  return { signedToken };
};
