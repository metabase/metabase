import dayjs from "dayjs";

import { type LocaleDataWithLanguage, setLocalization } from "./i18n";

function setup(language: string) {
  setLocalization({
    headers: { language, "plural-forms": "nplurals=2; plural=(n != 1);" },
    translations: { "": {} },
  });
}

describe("setLocalization", () => {
  it("should preserve latin numbers when formatting dates in 'ar' locale", () => {
    setup("ar");
    const date = dayjs.utc("2023-10-12T21:07:33.476Z");

    expect(date.format("MMMM D, YYYY, h:mm A")).toBe("أكتوبر 12، 2023، 9:07 م");
  });

  it("should preserve latin numbers when formatting dates in 'ar-sa' locale", () => {
    setup("ar-sa");
    const date = dayjs.utc("2023-10-12T21:07:33.476Z");

    expect(date.format("MMMM D, YYYY, h:mm A")).toBe("أكتوبر 12، 2023، 9:07 م");
  });

  it("should preserve latin numbers in the 'en' locale", () => {
    setup("en");
    const date = dayjs.utc("2023-10-12T21:07:33.476Z");

    expect(date.format("MMMM D, YYYY, h:mm A")).toBe(
      "October 12, 2023, 9:07 PM",
    );
  });

  it("should restore msgids in every context, not just the default one (metabase#77700)", () => {
    // Entries in the locale artifact carry no `msgid`, but ttag's addLocale requires one on every
    // entry in every context — a single entry without it throws and breaks the whole locale.
    const context =
      "Date granularity option, distinct from the pluralized unit";
    const translations: Record<
      string,
      Record<
        string,
        { msgid?: string; msgid_plural?: string; msgstr: string[] }
      >
    > = {
      "": { Year: { msgid_plural: "Years", msgstr: ["Año", "Años"] } },
      [context]: { Year: { msgstr: ["Año"] } },
    };
    const localeData: LocaleDataWithLanguage = {
      headers: {
        language: "es",
        "plural-forms": "nplurals=2; plural=(n != 1);",
      },
      translations,
    };

    expect(() => setLocalization(localeData)).not.toThrow();
    expect(translations[""].Year.msgid).toBe("Year");
    expect(translations[context].Year.msgid).toBe("Year");
  });
});
