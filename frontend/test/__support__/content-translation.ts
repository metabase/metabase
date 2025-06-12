import * as EnterpriseContentTranslationUtilsModule from "metabase-enterprise/content_translation/utils";

/**
 * One of the utility functions that makes the content translation feature tick
 * is translateContentString. It takes a msgid and returns a msgstr.
 * setupTranslateContentStringSpy mocks out this utility function. By default,
 * it also mocks out the implementation, so that `mock's translation of ${msgid}` is
 * returned. This makes unit testing easier.
 *
 * To check that no content translation was performed, use this spy to assert
 * that the translateContentString utility function was not invoked
 * */
export const setupTranslateContentStringSpy = (
  mockImplementation: EnterpriseContentTranslationUtilsModule.TranslateContentStringFunction = (
    ...[_dictionary, _locale, msgid]
  ) => `mock's translation of ${msgid}`,
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
