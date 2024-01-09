import { periodPopoverText } from "./periodPopoverText";

describe("periodPopoverText", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2020, 4, 13));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("builds date for `day`", () => {
    const text = periodPopoverText("day");
    const expectedText = "Right now, this is Wed, May 13";
    expect(text).toBe(expectedText);
  });

  it("builds dates for `week`", () => {
    const text = periodPopoverText("week");
    const expectedText = "Right now, this is Sun, May 10 - Sat, May 16";
    expect(text).toBe(expectedText);
  });

  it("builds dates for `month`", () => {
    const text = periodPopoverText("month");
    const expectedText = "Right now, this is Fri, May 1 - Sun, May 31";
    expect(text).toBe(expectedText);
  });

  it("builds dates for `quarter`", () => {
    const text = periodPopoverText("quarter");
    const expectedText = "Right now, this is Wed, Apr 1 - Tue, Jun 30";
    expect(text).toBe(expectedText);
  });

  it("builds dates for `year`", () => {
    const text = periodPopoverText("year");
    const expectedText = "Right now, this is Jan 1, 2020 - Dec 31, 2020";
    expect(text).toBe(expectedText);
  });
});
