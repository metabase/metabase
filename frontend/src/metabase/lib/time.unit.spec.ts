import { getIanaTimezone } from "./time";

describe("getIanaTimezone", () => {
  it("should return the original timezone if not in offset format", () => {
    expect(getIanaTimezone("America/New_York")).toBe("America/New_York");
    expect(getIanaTimezone("Europe/London")).toBe("Europe/London");
  });

  it.each([
    ["+01:00", "Etc/GMT-1"],
    ["-02:00", "Etc/GMT+2"],
    ["+00:00", "Etc/GMT"],
  ])("should return an IANA timezone for valid offsets", (offset, iana) => {
    expect(getIanaTimezone(offset)).toBe(iana);
  });

  it("should fall back to another timezone if no Etc/GMT timezone is found", () => {
    expect(getIanaTimezone("+09:30")).toBe("Australia/Adelaide");
  });

  it("should handle invalid offset formats gracefully", () => {
    expect(getIanaTimezone("unknown")).toBe("unknown");
  });
});
