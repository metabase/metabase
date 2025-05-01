import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage

import { setLazyLocalization, setLocalization } from "./i18n";

function setupSetLocalization(language: string) {
  setLocalization({
    headers: { language, "plural-forms": "nplurals=2; plural=(n != 1);" },
    translations: { "": {} },
  });
}

async function setupSetLazyLocalization(language: string) {
  const lazyLoadDateLocales = async (locale: string) => {
    if (locale === "en") {
      moment.locale("en");
      return;
    }

    await Promise.all([
      import(`moment/locale/${locale}.js`),
      import(`dayjs/locale/${locale}.js`),
    ]);
  };

  await setLazyLocalization({
    translationsObject: {
      headers: { language, "plural-forms": "nplurals=2; plural=(n != 1);" },
      translations: { "": {} },
    },
    lazyLoadDateLocales,
  });
}

describe("i18n", () => {
  describe("setLocalization", () => {
    it("should preserve latin numbers when formatting dates in 'ar' locale", () => {
      setupSetLocalization("ar");
      const m = moment.utc("2023-10-12T21:07:33.476Z");

      expect(m.format("MMMM D, YYYY, h:mm A")).toBe("أكتوبر 12، 2023، 9:07 م");
    });

    it("should preserve latin numbers when formatting dates in 'ar-sa' locale", () => {
      setupSetLocalization("ar-sa");
      const m = moment.utc("2023-10-12T21:07:33.476Z");

      expect(m.format("MMMM D, YYYY, h:mm A")).toBe("أكتوبر 12، 2023، 9:07 م");
    });

    it("should preserve latin numbers in the 'en' locale", () => {
      setupSetLocalization("en");
      const m = moment.utc("2023-10-12T21:07:33.476Z");

      expect(m.format("MMMM D, YYYY, h:mm A")).toBe(
        "October 12, 2023, 9:07 PM",
      );
    });
  });

  describe("setLazyLocalization", () => {
    it("should preserve latin numbers when formatting dates in 'ar' locale", async () => {
      await setupSetLazyLocalization("ar");
      const m = moment.utc("2023-10-12T21:07:33.476Z");

      expect(m.format("MMMM D, YYYY, h:mm A")).toBe("أكتوبر 12، 2023، 9:07 م");
    });

    it("should preserve latin numbers when formatting dates in 'ar-sa' locale", async () => {
      await setupSetLazyLocalization("ar-sa");
      const m = moment.utc("2023-10-12T21:07:33.476Z");

      expect(m.format("MMMM D, YYYY, h:mm A")).toBe("أكتوبر 12، 2023، 9:07 م");
    });

    it("should preserve latin numbers in the 'en' locale", async () => {
      await setupSetLazyLocalization("en");
      const m = moment.utc("2023-10-12T21:07:33.476Z");

      expect(m.format("MMMM D, YYYY, h:mm A")).toBe(
        "October 12, 2023, 9:07 PM",
      );
    });
  });
});
