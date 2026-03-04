import { useEffect } from "react";

import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getIsGuestEmbed } from "embedding-sdk-bundle/store/selectors";
import type { SdkEntityToken } from "embedding-sdk-bundle/types";
import { useLocale } from "metabase/common/hooks";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";

export const useSetupContentTranslations = ({
  token,
}: {
  token: SdkEntityToken | null;
}) => {
  const { locale } = useLocale();
  const isGuestEmbed = useSdkSelector(getIsGuestEmbed);

  useEffect(() => {
    if (locale !== "en" && isGuestEmbed && token) {
      PLUGIN_CONTENT_TRANSLATION.setEndpointsForStaticEmbedding(token);
    }
  }, [isGuestEmbed, locale, token]);
};

export const useSetupAuthContentTranslations = () => {
  const { locale } = useLocale();
  const isGuestEmbed = useSdkSelector(getIsGuestEmbed);

  useEffect(() => {
    if (locale !== "en" && !isGuestEmbed) {
      PLUGIN_CONTENT_TRANSLATION.setEndpointsForAuthEmbedding();
    }
  }, [locale, isGuestEmbed]);
};
