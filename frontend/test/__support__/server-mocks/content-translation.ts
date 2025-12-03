import fetchMock from "fetch-mock";

import type { DictionaryArray, DictionaryResponse } from "metabase-types/api";

export function setupContentTranslationEndpoints({
  dictionary = [],
  uploadSuccess = true,
}: {
  dictionary?: DictionaryArray;
  uploadSuccess?: boolean;
} = {}) {
  fetchMock.post("path:/api/ee/content-translation/upload-dictionary", () => ({
    success: uploadSuccess,
  }));

  fetchMock.get(
    "express:/api/ee/content-translation/dictionary/:token",
    (call): DictionaryResponse => {
      const localeCode = new URL(call.url).searchParams.get("locale");
      if (!localeCode) {
        throw new Error("Locale is required");
      }
      const data: DictionaryResponse["data"] = dictionary
        .filter((row) => row.locale === localeCode)
        .map((row, i) => ({ ...row, id: i }));
      return { data };
    },
  );
}
