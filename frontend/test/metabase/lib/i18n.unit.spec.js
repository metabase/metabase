import moment from "moment";

import { isLocale24Hour } from "metabase/lib/i18n";

describe("isLocale24Hour", () => {
  const testCases = [
    ["en", false],
    ["en-us", false],
    ["en-gb", true],
    ["fr", true],
    ["zh-cn", true],
  ];
  for (const [locale, is24] of testCases) {
    it(`should return ${is24} for '${locale}'`, () => {
      // save locale before changing it
      const startingLocale = moment.locale();

      moment.locale(locale);
      expect(isLocale24Hour()).toBe(is24);

      // reset locale
      moment.locale(startingLocale);
    });
  }
});
