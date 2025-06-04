import fetchMock from "fetch-mock";

import * as EnterpriseContentTranslationUtilsModule from "metabase-enterprise/content_translation/utils";
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

/**
 * One of the utility functions that makes the content translation feature tick
 * is translateContentString. It takes a msgid and returns a msgstr.
 * setupTranslateContentStringSpy mocks out this utility function. By default,
 * it also mocks out the implementation, so that `translated_${msgid}` is
 * returned. This makes unit testing easier.
 *
 * To check that no content translation was performed, use this spy to assert
 * that the translateContentString utility function was not invoked
 * */
export const setupTranslateContentStringSpy = (
  mockImplementation: EnterpriseContentTranslationUtilsModule.TranslateContentStringFunction = (
    ...[_dictionary, _locale, msgid]
  ) => `translated_${msgid}`,
) => {
  let translateContentStringSpy: jest.SpyInstance;

  beforeEach(() => {
    translateContentStringSpy = jest.spyOn(
      EnterpriseContentTranslationUtilsModule,
      "translateContentString",
    );

    if (mockImplementation) {
      translateContentStringSpy.mockImplementation(mockImplementation);
    }
  });

  afterEach(() => {
    translateContentStringSpy?.mockClear();
    translateContentStringSpy?.mockRestore();
  });

  return () => translateContentStringSpy;
};
