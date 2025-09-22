import { useCallback } from "react";

import type { EmbeddingParameters } from "metabase/public/lib/types";
import { useHideParameter } from "metabase-enterprise/embedding_iframe_sdk_setup/components/ParameterSettings/hooks/use-hide-parameter";
import { useLockParameter } from "metabase-enterprise/embedding_iframe_sdk_setup/components/ParameterSettings/hooks/use-lock-parameter";
import { useSdkIframeEmbedSetupContext } from "metabase-enterprise/embedding_iframe_sdk_setup/context";
import type { Parameter } from "metabase-types/api";

export const useStaticEmbeddingParameters = () => {
  const { updateSettings } = useSdkIframeEmbedSetupContext();
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

  const setEmbeddingParameters = useCallback(
    (nextEmbeddingParameters: EmbeddingParameters) => {
      const { hiddenParameters, lockedParameters } = Object.entries(
        nextEmbeddingParameters,
      ).reduce(
        (acc, [slug, state]) => {
          if (state === "locked") {
            acc.lockedParameters.push(slug);
            // Also hide params to prevent showing ParametersList
            acc.hiddenParameters.push(slug);
          }

          if (state === "disabled") {
            acc.hiddenParameters.push(slug);
          }

          return acc;
        },
        {
          hiddenParameters: [] as string[],
          lockedParameters: [] as string[],
        },
      );

      updateSettings({
        hiddenParameters,
        lockedParameters,
      });
    },
    [updateSettings],
  );

  return { buildEmbeddedParameters, setEmbeddingParameters };
};
