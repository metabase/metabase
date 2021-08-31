import { formatDate, formatNumber } from "./formatting";

describe("formatDate", () => {
  it("should format a date with default settings", () => {
    const date = new Date(2018, 0, 10);

    const text = formatDate(date);

    expect(text).toEqual("1/10/2018");
  });

  it("should format a date with style option", () => {
    const date = new Date(2018, 0, 10);

    const text = formatDate(date, {
      date_style: "dddd, MMMM D, YYYY",
    });

    expect(text).toEqual("Wednesday, January 10, 2018");
  });

  it("should format a date with abbreviate option", () => {
    const date = new Date(2018, 0, 10);

    const text = formatDate(date, {
      date_style: "dddd, MMMM D, YYYY",
      date_abbreviate: true,
    });

    expect(text).toEqual("Wed, Jan 10, 2018");
  });

  it("should format a date with separator option", () => {
    const date = new Date(2018, 0, 10);

    const text = formatDate(date, {
      date_style: "M/D/YYYY",
      date_separator: "-",
    });

    expect(text).toEqual("1-10-2018");
  });

  it("should format a date with time", () => {
    const date = new Date(2018, 0, 10, 15, 10, 20);

    const text = formatDate(date, {
      time_enabled: true,
    });

    expect(text).toEqual("1/10/2018 3:10 PM");
  });

  it("should format a date with time and 24-hour clock", () => {
    const date = new Date(2018, 0, 10, 15, 10, 20);

    const text = formatDate(date, {
      time_enabled: true,
      time_style: "HH:mm",
    });

    expect(text).toEqual("1/10/2018 15:10");
  });
});

describe("formatNumber", () => {
  it("should format a number with default options", () => {
    const number = 15;

    const text = formatNumber(number);

    expect(text).toEqual("15");
  });
});
