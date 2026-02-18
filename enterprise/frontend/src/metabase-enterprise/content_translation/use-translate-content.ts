import { useCallback, useSyncExternalStore } from "react";

import { skipToken } from "metabase/api";
import { useLocale } from "metabase/common/hooks";
import type { ContentTranslationFunction } from "metabase/i18n/types";
import { useListContentTranslationsQuery } from "metabase-enterprise/api";

import { dictionaryEndpointStore } from "./constants";
import { translateContentString } from "./utils";

/** When there are no translations, the content-translation function simply
 * returns the provided string, untranslated */
export const leaveUntranslated: ContentTranslationFunction = (msgid) => msgid;

/** Returns true if the content-translation function is doing more than just
 * returning the provided string, untranslated */
export const hasTranslations = (
  tc?: ContentTranslationFunction,
): tc is ContentTranslationFunction => !!tc && tc !== leaveUntranslated;

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
  const dictionaryEndpoint = useSyncExternalStore(
    dictionaryEndpointStore.subscribe,
    dictionaryEndpointStore.getSnapshot,
  );
  const { data } = useListContentTranslationsQuery(
    dictionaryEndpoint
      ? {
          locale,
        }
      : skipToken,
  );
  const dictionary = data?.data;
  return dictionary;
};
