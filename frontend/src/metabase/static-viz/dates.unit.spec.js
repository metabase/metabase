import { formatDateTime } from "./dates";

describe("formatDateTime", () => {
  it("should format dates with default settings", () => {
    const date = new Date(2018, 0, 10);

    const text = formatDateTime(date);

    expect(text).toEqual("1/10/2018");
  });

  it("should format dates with style option", () => {
    const date = new Date(2018, 0, 10);

    const text = formatDateTime(date, {
      date_style: "dddd, MMMM D, YYYY",
    });

    expect(text).toEqual("Wednesday, January 10, 2018");
  });

  it("should format dates with abbreviate option", () => {
    const date = new Date(2018, 0, 10);

    const text = formatDateTime(date, {
      date_style: "dddd, MMMM D, YYYY",
      date_abbreviate: true,
    });

    expect(text).toEqual("Wed, Jan 10, 2018");
  });

  it("should format dates with separator option", () => {
    const date = new Date(2018, 0, 10);

    const text = formatDateTime(date, {
      date_style: "M/D/YYYY",
      date_separator: "-",
    });

    expect(text).toEqual("1-10-2018");
  });
});
