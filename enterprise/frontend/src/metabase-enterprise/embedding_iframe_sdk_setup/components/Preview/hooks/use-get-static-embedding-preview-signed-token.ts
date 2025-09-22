import { useMemo } from "react";
import { useAsync } from "react-use";

import { useSetting } from "metabase/common/hooks";
import { checkNotNull } from "metabase/lib/types";
import { getPreviewParamsBySlug } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/lib/get-preview-params-by-slug";
import { getSignedToken } from "metabase/public/lib/embed";
import { useParameters } from "metabase-enterprise/embedding_iframe_sdk_setup/components/ParameterSettings/hooks/use-parameters";
import { useStaticEmbeddingParameters } from "metabase-enterprise/embedding_iframe_sdk_setup/components/ParameterSettings/hooks/use-static-embedding-paramers";
import { useSdkIframeEmbedSetupContext } from "metabase-enterprise/embedding_iframe_sdk_setup/context";

export const useGetStaticEmbeddingPreviewSignedToken = () => {
  const siteUrl = useSetting("site-url");
  const secretKey = checkNotNull(useSetting("embedding-secret-key"));

  const { settings, availableParameters } = useSdkIframeEmbedSetupContext();

  const { getParameterValuesById } = useParameters();
  const { buildEmbeddedParameters } = useStaticEmbeddingParameters();

  const resourceType = settings.dashboardId ? "dashboard" : "question";
  const embeddingParams = useMemo(
    () => buildEmbeddedParameters(availableParameters),
    [availableParameters, buildEmbeddedParameters],
  );

  const parameterValues = useMemo(
    () => getParameterValuesById(),
    [getParameterValuesById],
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

  const { value: signedToken = "" } = useAsync(
    async () =>
      getSignedToken(
        resourceType,
        settings.dashboardId ?? settings.questionId ?? "",
        previewParamsBySlug,
        secretKey,
        embeddingParams,
      ),
    [
      siteUrl,
      previewParamsBySlug,
      resourceType,
      settings.dashboardId,
      settings.questionId,
      secretKey,
      embeddingParams,
    ],
  );

  return { signedToken };
};
