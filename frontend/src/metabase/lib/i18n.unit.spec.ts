import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage

import { setLocalization } from "./i18n";

function setup(language: string) {
  setLocalization({
    headers: { language, "plural-forms": "nplurals=2; plural=(n != 1);" },
    translations: { "": {} },
  });
}

describe("setLocalization", () => {
  it("should preserve latin numbers when formatting dates in 'ar' locale", () => {
    setup("ar");
    const m = moment.utc("2023-10-12T21:07:33.476Z");

    expect(m.format("MMMM D, YYYY, h:mm A")).toBe("أكتوبر 12، 2023، 9:07 م");
  });

  it("should preserve latin numbers when formatting dates in 'ar-sa' locale", () => {
    setup("ar-sa");
    const m = moment.utc("2023-10-12T21:07:33.476Z");

    expect(m.format("MMMM D, YYYY, h:mm A")).toBe("أكتوبر 12، 2023، 9:07 م");
  });

  it("should preserve latin numbers in the 'en' locale", () => {
    setup("en");
    const m = moment.utc("2023-10-12T21:07:33.476Z");

    expect(m.format("MMMM D, YYYY, h:mm A")).toBe("October 12, 2023, 9:07 PM");
  });
});
