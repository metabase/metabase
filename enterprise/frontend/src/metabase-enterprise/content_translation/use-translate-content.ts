import { useCallback } from "react";

import { useListContentTranslationsQuery } from "metabase/api/content-translation";
import { skipToken } from "metabase/api";
import { useLocale } from "metabase/common/hooks";
import type { ContentTranslationFunction } from "metabase/i18n/types";

import { translateContentString } from "./utils";

export const useTranslateContent = (): ContentTranslationFunction => {
  const locale = useLocale();

  const { data } = useListContentTranslationsQuery({ locale });
  const dictionary = data?.data;

  return useCallback(
    <T extends string | null | undefined>(msgid: T) =>
      translateContentString(dictionary, locale, msgid),
    [locale, dictionary],
  );
};

/**
 * Returns a mapping of locales to translations for the given msgid.
 */
export const useLocaleToTranslationMapping = (
  /** A 'msgid' is a raw untranslated string */
  msgid?: string | null,
) => {
  const { data, isFetching, error } = useListContentTranslationsQuery(
    msgid && msgid.trim() ? undefined : skipToken,
  );
  const dictionary = data?.data;

  if (!msgid || !msgid.trim()) {
    return { localeToTranslation: undefined, isFetching: false, error: null };
  }

  const localeToTranslation = dictionary
    ?.filter((row) => row.msgid === msgid)
    .reduce<Record<string, string>>(
      (acc, row) => ({
        ...acc,
        [row.locale]: row.msgstr,
      }),
      {},
    );
  return { localeToTranslation, isFetching, error };
};
