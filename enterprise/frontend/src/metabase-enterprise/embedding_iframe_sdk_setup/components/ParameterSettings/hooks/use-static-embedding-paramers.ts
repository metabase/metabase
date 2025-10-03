import { useCallback } from "react";

import type { EmbeddingParameters } from "metabase/public/lib/types";
import { useHideParameter } from "metabase-enterprise/embedding_iframe_sdk_setup/components/ParameterSettings/hooks/use-hide-parameter";
import { useLockParameter } from "metabase-enterprise/embedding_iframe_sdk_setup/components/ParameterSettings/hooks/use-lock-parameter";
import { getSdkIframeEmbedSettingsForEmbeddingParameters } from "metabase-enterprise/embedding_iframe_sdk_setup/utils/get-sdk-iframe-embed-settings-for-embedding-parameters";
import type { Parameter } from "metabase-types/api";

export const useEmbeddingParameters = () => {
  const { isParameterHidden } = useHideParameter();
  const { isLockedParameter } = useLockParameter();

  const buildEmbeddedParameters = useCallback(
    (parameters: Parameter[]) => {
      return parameters.reduce<EmbeddingParameters>((acc, { slug }) => {
        if (isLockedParameter(slug)) {
          acc[slug] = "locked";
        } else {
          acc[slug] = isParameterHidden(slug) ? "disabled" : "enabled";
        }

        return acc;
      }, {});
    },
    [isLockedParameter, isParameterHidden],
  );

  return {
    buildEmbeddedParameters,
    getSettingsFromEmbeddingParameters:
      getSdkIframeEmbedSettingsForEmbeddingParameters,
  };
};
