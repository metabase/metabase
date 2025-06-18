import fetchMock from "fetch-mock";
import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import { t } from "ttag";

import { loadLazyLocalization, setLocalization } from "./i18n";

function setupLocalization(language: string) {
  setLocalization({
    headers: { language, "plural-forms": "nplurals=2; plural=(n != 1);" },
    translations: { "": {} },
  });
}

async function setupLoadLazyLocalization(locale: string) {
  const lazyLoadDateLocales = async (dateLocale: string) => {
    if (dateLocale === "en") {
      moment.locale("en");
      return;
    }

    await Promise.all([
      import(`moment/locale/${dateLocale}.js`),
      import(`dayjs/locale/${dateLocale}.js`),
    ]);
  };

  const translationObject = {
    headers: {
      language: locale,
      "plural-forms": "nplurals=2; plural=(n != 1);",
    },
    translations: {
      "": {
        Table: {
          msgstr: ["Tabla"],
        },
      },
    },
  };

  fetchMock.get(`path:/app/locales/${locale}.json`, translationObject);
  await loadLazyLocalization(locale, lazyLoadDateLocales);
}

describe("i18n", () => {
  describe("setLocalization", () => {
    it("should preserve latin numbers when formatting dates in 'ar' locale", () => {
      setupLocalization("ar");
      const m = moment.utc("2023-10-12T21:07:33.476Z");

      expect(m.format("MMMM D, YYYY, h:mm A")).toBe("أكتوبر 12، 2023، 9:07 م");
    });

    it("should preserve latin numbers when formatting dates in 'ar-sa' locale", () => {
      setupLocalization("ar-sa");
      const m = moment.utc("2023-10-12T21:07:33.476Z");

      expect(m.format("MMMM D, YYYY, h:mm A")).toBe("أكتوبر 12، 2023، 9:07 م");
    });

    it("should preserve latin numbers in the 'en' locale", () => {
      setupLocalization("en");
      const m = moment.utc("2023-10-12T21:07:33.476Z");

      expect(m.format("MMMM D, YYYY, h:mm A")).toBe(
        "October 12, 2023, 9:07 PM",
      );
    });
  });

  describe("loadLazyLocalization", () => {
    it("should set metabase locale", async () => {
      await setupLoadLazyLocalization("es");

      expect(t`Table`).toBe("Tabla");
    });

    it("should preserve latin numbers when formatting dates in 'ar' locale", async () => {
      await setupLoadLazyLocalization("ar");
      const m = moment.utc("2023-10-12T21:07:33.476Z");

      expect(m.format("MMMM D, YYYY, h:mm A")).toBe("أكتوبر 12، 2023، 9:07 م");
    });

    it("should preserve latin numbers when formatting dates in 'ar-sa' locale", async () => {
      await setupLoadLazyLocalization("ar-sa");
      const m = moment.utc("2023-10-12T21:07:33.476Z");

      expect(m.format("MMMM D, YYYY, h:mm A")).toBe("أكتوبر 12، 2023، 9:07 م");
    });

    it("should preserve latin numbers in the 'en' locale", async () => {
      await setupLoadLazyLocalization("en");
      const m = moment.utc("2023-10-12T21:07:33.476Z");

      expect(m.format("MMMM D, YYYY, h:mm A")).toBe(
        "October 12, 2023, 9:07 PM",
      );
    });
  });
});
