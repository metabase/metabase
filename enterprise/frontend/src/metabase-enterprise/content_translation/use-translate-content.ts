import { useCallback } from "react";

import { skipToken } from "metabase/api";
import { useLocale } from "metabase/common/hooks";
import type { ContentTranslationFunction } from "metabase/i18n/types";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import { useListContentTranslationsQuery } from "metabase-enterprise/api";

import { translateContentString } from "./utils";

export const useTranslateContent = (): ContentTranslationFunction => {
  const locale = useLocale();
  const dictionary = useListContentTranslations();

  return useCallback(
    <T = string | null | undefined>(msgid: T) =>
      translateContentString<T>(dictionary || [], locale, msgid),
    [locale, dictionary],
  );
};

export const useListContentTranslations = () => {
  const locale = useLocale();
  const { data } = useListContentTranslationsQuery(
    PLUGIN_CONTENT_TRANSLATION.isEnabled &&
      // This URL is currently only defined in static embedding
      PLUGIN_CONTENT_TRANSLATION.contentTranslationDictionaryUrl
      ? {
          locale,
        }
      : skipToken,
  );
  const dictionary = data?.data;
  return dictionary;
};
