import { t } from "ttag";

import { applyDocumentLocales } from "metabase/utils/boot-locale";

describe("applyDocumentLocales", () => {
  afterEach(() => {
    delete window.MetabaseLocales;
    delete window.MetabaseUserLocalization;
    delete window.MetabaseSiteLocalization;
  });

  it("should not error on English, which has no catalogue of its own", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    window.MetabaseLocales = { user: "en", site: "en" };

    await applyDocumentLocales();

    expect(consoleError).not.toHaveBeenCalled();
    expect(window.MetabaseUserLocalization?.headers.language).toBe("en");
    expect(t`Filter`).toBe("Filter");
  });
});

describe("applyDocumentLocales with a user locale", () => {
  afterEach(() => {
    delete window.MetabaseLocales;
  });

  it("loads the user locale it is given instead of the document's", async () => {
    window.MetabaseLocales = { user: "en", site: "en" };
    const loadLocaleCatalog = jest.fn(async (locale: string) => ({
      headers: {
        language: locale,
        "plural-forms": "nplurals=2; plural=(n != 1);",
      },
      translations: { "": {} },
    }));

    await jest.isolateModulesAsync(async () => {
      jest.doMock("metabase/utils/localization", () => ({ loadLocaleCatalog }));
      const bootLocale = await import("metabase/utils/boot-locale");

      await bootLocale.applyDocumentLocales("de");
    });

    expect(loadLocaleCatalog).toHaveBeenCalledWith("de");
  });
});
