import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage

import { parseTime } from "./time";

describe("parseTime", () => {
  it("should return a moment object for valid time strings", () => {
    const timeString = "12:34:56";
    const result = parseTime(timeString);
    expect(result.isValid()).toBe(true);
    expect(result.format("HH:mm:ss")).toBe("12:34:56");
  });

  it("should return a moment object for valid moment objects", () => {
    const momentObj = moment("2023-10-01T12:34:56");
    const result = parseTime(momentObj);
    expect(result.isValid()).toBe(true);
    expect(result.format()).toBe(momentObj.format());
  });

  it("should return an invalid moment object for invalid input", () => {
    const invalidInput = "invalid-time";
    const result = parseTime(invalidInput);
    expect(result.isValid()).toBe(false);
  });

  it("should work with seconds", () => {
    const timeString = "13:22:11+01:00";
    const result = parseTime(timeString);
    expect(result.isValid()).toBe(true);
    expect(result.format("HH:mm:ss")).toBe("13:22:11");
  });

  it("should handle time with milliseconds", () => {
    const timeString = "13:22:11+01:00";
    const result = parseTime(timeString);
    expect(result.isValid()).toBe(true);
    expect(result.format("HH:mm:ss.SSS")).toBe("13:22:11.000");
  });
});
