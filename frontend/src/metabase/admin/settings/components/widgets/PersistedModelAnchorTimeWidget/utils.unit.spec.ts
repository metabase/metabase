import moment, { Moment } from "moment";
import { getNextExpectedRefreshTime } from "./utils";

describe("getNextExpectedRefreshTime", () => {
  it("should jump forward by refresh interval (hours)", () => {
    const fromTime = moment({ hours: 12, minutes: 0 });
    const result = getNextExpectedRefreshTime(fromTime, 8, "10:00");
    expect(result.hours()).toBe(20);
    expect(result.minutes()).toBe(0);
  });

  it("should respect minutes", () => {
    const fromTime = moment({ hours: 12, minutes: 15 });
    const result = getNextExpectedRefreshTime(fromTime, 6, "10:00");
    expect(result.hours()).toBe(18);
    expect(result.minutes()).toBe(15);
  });

  it("should stick to anchor time for refreshes tomorrow", () => {
    const fromTime = moment({ hours: 19, minutes: 0 });
    const result = getNextExpectedRefreshTime(fromTime, 6, "10:00");
    expect(result.hours()).toBe(10);
    expect(result.minutes()).toBe(0);
  });
});
