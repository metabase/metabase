import { useEffect } from "react";

import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getIsGuestEmbedRaw } from "embedding-sdk-bundle/store/selectors";
import type { SdkEntityToken } from "embedding-sdk-bundle/types";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";

export const useSetupContentTranslations = ({
  token,
}: {
  token: SdkEntityToken | null;
}) => {
  const isGuestEmbedRaw = useSdkSelector(getIsGuestEmbedRaw);

  useEffect(() => {
    if (isGuestEmbedRaw === true && token) {
      PLUGIN_CONTENT_TRANSLATION.setEndpointsForStaticEmbedding(token);
    }
  }, [isGuestEmbedRaw, token]);
};

export const useSetupAuthContentTranslations = () => {
  // Use the raw selector so we can distinguish "not yet known" (null) from
  // "known to be auth embed" (false). ComponentProvider dispatches
  // setIsGuestEmbed in a useEffect, so on the first render isGuestEmbed is
  // still null — firing setEndpointsForAuthEmbedding then would corrupt the
  // content translation endpoint for guest embeds (EMB-1478).
  const isGuestEmbed = useSdkSelector(getIsGuestEmbedRaw);

  useEffect(() => {
    if (isGuestEmbed === false) {
      PLUGIN_CONTENT_TRANSLATION.setEndpointsForAuthEmbedding();
    }
  }, [isGuestEmbed]);
};
