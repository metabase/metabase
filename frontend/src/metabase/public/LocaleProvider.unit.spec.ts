/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["expect", "expectLocale"] }] */
import { getLocaleToUse } from "./LocaleProvider";

const expectLocale = ({
  locale,
  availableLocales,
  expected,
}: {
  locale: string;
  availableLocales: string[];
  expected: string;
}) => {
  it(`getLocaleToUse(${locale}, [${availableLocales.join(", ")}]) should return ${expected}`, () => {
    expect(getLocaleToUse(locale, availableLocales)).toBe(expected);
  });
};

const availableLocales = ["de", "en", "pt_BR", "zh_CN", "zh_HK", "zh_TW"];

describe("getLocaleToUse", () => {
  describe("when given a locale in the format $language-$country", () => {
    describe("it should return the input locale if it is available", () => {
      expectLocale({
        locale: "zh-TW",
        availableLocales,
        expected: "zh_TW",
      });
    });

    describe("it should fallback to $language if that's available and $language-$country is not", () => {
      expectLocale({
        locale: "en-US",
        availableLocales,
        expected: "en",
      });
    });

    describe("it should fallback to the first locale-country with the correct locale found if the locale is not valid", () => {
      expectLocale({
        locale: "zh-XY",
        availableLocales,
        expected: "zh_CN",
      });
    });

    describe("it should return 'en if the locale is not valid", () => {
      expectLocale({
        locale: "it-CH",
        availableLocales,
        expected: "en",
      });
    });
  });

  describe("when given a locale in the format of $language", () => {
    describe("it should return the input locale if it is available", () => {
      expectLocale({
        locale: "de",
        availableLocales,
        expected: "de",
      });
    });

    describe("it should fallback to the first locale-country with the correct locale found if the locale is not valid", () => {
      expectLocale({
        locale: "pt",
        availableLocales,
        expected: "pt_BR",
      });
    });

    describe("it should return 'en' if the locale is not valid", () => {
      expectLocale({
        locale: "it",
        availableLocales,
        expected: "en",
      });
    });
  });

  describe("when given a non normalized locale, it should normalize it", () => {
    expectLocale({
      locale: "Zh-tW",
      availableLocales,
      expected: "zh_TW",
    });

    expectLocale({
      locale: "Pt",
      availableLocales,
      expected: "pt_BR",
    });

    expectLocale({
      locale: "DE",
      availableLocales,
      expected: "de",
    });
  });
});
