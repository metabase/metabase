import { formatDate } from "./dates";

describe("formatDate", () => {
  it("should format dates with default settings", () => {
    const date = new Date(2018, 0, 10);

    const text = formatDate(date);

    expect(text).toEqual("1/10/2018");
  });

  it("should format dates with style option", () => {
    const date = new Date(2018, 0, 10);

    const text = formatDate(date, {
      date_style: "dddd, MMMM D, YYYY",
    });

    expect(text).toEqual("Wednesday, January 10, 2018");
  });

  it("should format dates with abbreviate option", () => {
    const date = new Date(2018, 0, 10);

    const text = formatDate(date, {
      date_style: "dddd, MMMM D, YYYY",
      date_abbreviate: true,
    });

    expect(text).toEqual("Wed, Jan 10, 2018");
  });

  it("should format dates with separator option", () => {
    const date = new Date(2018, 0, 10);

    const text = formatDate(date, {
      date_style: "M/D/YYYY",
      date_separator: "-",
    });

    expect(text).toEqual("1-10-2018");
  });

  it("should format dates with time", () => {
    const date = new Date(2018, 0, 10, 15, 10, 20);

    const text = formatDate(date, {
      time_enabled: true,
    });

    expect(text).toEqual("1/10/2018 3:10 PM");
  });

  it("should format dates with time and 24-hour clock", () => {
    const date = new Date(2018, 0, 10, 15, 10, 20);

    const text = formatDate(date, {
      time_enabled: true,
      time_style: "HH:mm",
    });

    expect(text).toEqual("1/10/2018 15:10");
  });
});
