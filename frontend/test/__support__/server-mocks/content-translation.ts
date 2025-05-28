import fetchMock from "fetch-mock";

import * as EnterpriseContentTranslationUtilsModule from "metabase-enterprise/content_translation/utils";
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

/** To check that no content translation was performed, use this spy to assert
 * that the translateContentString utility function was not invoked */
export const setupTranslateContentStringSpy = () => {
  let translateContentStringSpy: jest.SpyInstance;

  beforeEach(() => {
    translateContentStringSpy = jest.spyOn(
      EnterpriseContentTranslationUtilsModule,
      "translateContentString",
    );
  });

  afterEach(() => {
    translateContentStringSpy?.mockClear();
    translateContentStringSpy?.mockRestore();
  });

  return () => translateContentStringSpy;
};
