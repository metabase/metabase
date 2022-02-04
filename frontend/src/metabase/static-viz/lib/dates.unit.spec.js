import { formatDate } from "./dates";

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

  it("should format a date at the end of the quarter", () => {
    const date = new Date(2018, 2, 10);

    const text = formatDate(date, {
      date_style: "Q",
    });

    expect(text).toEqual("Q1");
  });

  it("should format a date at the start of the quarter", () => {
    const date = new Date(2018, 3, 10);

    const text = formatDate(date, {
      date_style: "Q",
    });

    expect(text).toEqual("Q2");
  });
});
