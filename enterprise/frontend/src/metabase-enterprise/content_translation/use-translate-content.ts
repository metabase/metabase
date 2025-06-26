import { useCallback } from "react";

import { skipToken } from "metabase/api";
import { useLocale } from "metabase/common/hooks";
import type { ContentTranslationFunction } from "metabase/i18n/types";
import { useListContentTranslationsQuery } from "metabase-enterprise/api";

import { contentTranslationEndpoints } from "./constants";
import { leaveUntranslated, translateContentString } from "./utils";

export const useTranslateContent = (): ContentTranslationFunction => {
  const { locale } = useLocale();
  const dictionary = useListContentTranslations();

  const tc = useCallback<ContentTranslationFunction>(
    <T = string | null | undefined>(msgid: T) =>
      dictionary?.length
        ? translateContentString<T>(dictionary || [], locale, msgid)
        : leaveUntranslated(msgid),
    [locale, dictionary],
  );

  return tc;
};

export const useListContentTranslations = () => {
  const { locale } = useLocale();
  const { data } = useListContentTranslationsQuery(
    contentTranslationEndpoints.getDictionary
      ? {
          locale,
        }
      : skipToken,
  );
  const dictionary = data?.data;
  return dictionary;
};
