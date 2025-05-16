import { useCallback } from "react";

import { useLocale } from "metabase/common/hooks";
import type { ContentTranslationFunction } from "metabase/i18n/types";
import { useListContentTranslationsQuery } from "metabase-enterprise/api";

import { translateContentString } from "./utils";

export const useTranslateContent = (): ContentTranslationFunction => {
  const locale = useLocale();

  const { data } = useListContentTranslationsQuery({
    locale,
  });
  const dictionary = data?.data;

  return useCallback(
    <T = string | null | undefined>(msgid: T) =>
      translateContentString<T>(dictionary, locale, msgid),
    [locale, dictionary],
  );
};
