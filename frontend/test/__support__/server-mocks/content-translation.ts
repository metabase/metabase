import fetchMock from "fetch-mock";

import type { DictionaryResponse } from "metabase-types/api";

export function setupContentTranslationEndpoints({
  dictionary = [],
  uploadSuccess = true,
}: {
  dictionary?: DictionaryResponse["data"];
  uploadSuccess?: boolean;
} = {}) {
  fetchMock.get(
    "path:/api/content-translation/dictionary",
    (url): DictionaryResponse => {
      const localeCode = new URL(url).searchParams.get("locale");
      const data = localeCode
        ? dictionary.filter((row) => row.locale === localeCode)
        : dictionary;
      return { data };
    },
  );
  fetchMock.post("path:/api/ee/content-translation/upload-dictionary", () => ({
    success: uploadSuccess,
  }));
}
