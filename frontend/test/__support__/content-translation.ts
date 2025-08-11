import * as EnterpriseContentTranslationUtilsModule from "metabase-enterprise/content_translation/utils";

/**
 * One of the utility functions that makes the content translation feature tick
 * is translateContentString. It takes a msgid and returns a msgstr.
 * setupTranslateContentStringSpy spies on this utility function but allows
 * it to execute its normal implementation (which hits the mocked endpoint).
 * This enables both spy assertion and integration testing of the async translation flow.
 *
 * To check that no content translation was performed, use this spy to assert
 * that the translateContentString utility function was not invoked.
 *
 * To provide a custom implementation, pass mockImplementation parameter.
 * */
export const setupTranslateContentStringSpy = (
  mockImplementation?: EnterpriseContentTranslationUtilsModule.TranslateContentStringFunction,
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
