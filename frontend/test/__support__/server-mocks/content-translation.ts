import fetchMock from "fetch-mock";

import type { DictionaryResponse } from "metabase-types/api";

export function setupContentTranslationEndpoints({
  dictionary = [],
}: {
  dictionary?: DictionaryResponse["data"];
}) {
  fetchMock.post("path:/api/ee/content-translation/upload-dictionary", () => ({
    success: true,
  }));
  fetchMock.get(
    "path:/api/ee/embedded-content-translation/dictionary/*",
    (url): DictionaryResponse => {
      const localeCode = new URL(url).searchParams.get("locale");
      if (!localeCode) {
        throw new Error("Locale is required");
      }
      const data = dictionary.filter((row) => row.locale === localeCode);
      return { data };
    },
  );
}
