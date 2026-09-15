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
