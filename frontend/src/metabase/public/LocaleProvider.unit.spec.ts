import { validateLocale } from "./LocaleProvider";

describe("validateLocale", () => {
  it("should return the aa_bb when passed aa-bb and aa-bb is available", () => {
    const locale = "zh-TW";
    const availableLocales = ["zh-TW", "en"];
    expect(validateLocale(locale, availableLocales)).toBe(locale);
  });

  it("should fallback to the language if the locale is not valid", () => {
    const locale = "zh-ZZ";
    const availableLocales = ["zh-TW", "zh", "en"];
    expect(validateLocale(locale, availableLocales)).toBe("zh");
  });

  it("should fallback to en if the locale is not valid", () => {
    const locale = "de";
    const availableLocales = ["zh-TW", "en"];
    expect(validateLocale(locale, availableLocales)).toBe("en");
  });

  it("should fallback to the first locale-country available if the locale is not valid", () => {
    const locale = "zh-ZZ";
    const availableLocales = ["zh-TW", "zh-CN", "en"];
    expect(validateLocale(locale, availableLocales)).toBe("zh-TW");
  });
});
