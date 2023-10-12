import moment from "moment-timezone";

import "./i18n";

describe("preserveLatinNumbersInArabic", () => {
  it("should preserve latin numbers when formatting dates in 'ar' locale", () => {
    moment.locale("ar");
    const m = moment("2023-10-12T21:07:33.476Z");

    expect(m.format("MMMM D, YYYY, h:mm A")).toBe("أكتوبر 12، 2023، 2:07 م");
  });

  it("should preserve latin numbers when formatting dates in 'ar-sa' locale", () => {
    moment.locale("ar-sa");
    const m = moment("2023-10-12T21:07:33.476Z");

    expect(m.format("MMMM D, YYYY, h:mm A")).toBe("أكتوبر 12، 2023، 2:07 م");
  });

  it("should preserve latin number in the 'en' locale", () => {
    moment.locale("en");
    const m = moment("2023-10-12T21:07:33.476Z");

    expect(m.format("MMMM D, YYYY, h:mm A")).toBe("October 12, 2023, 2:07 PM");
  });
});
