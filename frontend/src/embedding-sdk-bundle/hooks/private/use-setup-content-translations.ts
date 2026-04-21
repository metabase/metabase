import { useEffect } from "react";

import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getIsGuestEmbed } from "embedding-sdk-bundle/store/selectors";
import { useLocale } from "metabase/common/hooks";
import type { SdkEntityToken } from "metabase/embed/sdk-bundle/types";
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
