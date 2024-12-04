import dayjs from "dayjs";

import { getCurrentUTCTimestamp, shouldShowTrialBanner } from "./utils";

describe("app banner utils", () => {
  describe("shouldShowBanner", () => {
    it("should return false if daysRemaining is less than 0", () => {
      expect(
        shouldShowTrialBanner({
          tokenExpiryTimestamp: "2021-01-01",
          daysRemaining: -1,
        }),
      ).toBe(false);
    });

    it.each([3, 2, 1, 0])(
      "should return true if daysRemaining is %s but the banner was never dismissed",
      daysRemaining => {
        expect(
          shouldShowTrialBanner({
            tokenExpiryTimestamp: "2021-11-27",
            daysRemaining,
          }),
        ).toBe(true);
      },
    );

    it.each([3, 2, 1, 0])(
      "should return true if daysRemaining is %s but the banner was dismissed before that",
      daysRemaining => {
        const tokenExpiryTimestamp = "2021-11-27";

        expect(
          shouldShowTrialBanner({
            tokenExpiryTimestamp,
            daysRemaining,
            lastDismissed: dayjs(tokenExpiryTimestamp)
              .subtract(daysRemaining, "days")
              .subtract(1, "minute")
              .toISOString(),
          }),
        ).toBe(true);
      },
    );

    it.each([3, 2, 1, 0])(
      "should return false if daysRemaining is %s and the banner was dismissed on that day",
      daysRemaining => {
        const tokenExpiryTimestamp = "2021-11-27";

        expect(
          shouldShowTrialBanner({
            tokenExpiryTimestamp,
            daysRemaining,
            lastDismissed: dayjs(tokenExpiryTimestamp)
              .subtract(daysRemaining, "days")
              .toISOString(),
          }),
        ).toBe(false);
      },
    );

    it.each([42, 180, 14])(
      "should return false if daysRemaining is %s and the banner was dismissed at any point in the past",
      daysRemaining => {
        expect(
          shouldShowTrialBanner({
            tokenExpiryTimestamp: "2021-11-27",
            daysRemaining,
            lastDismissed: "2021-11-15",
          }),
        ).toBe(false);
      },
    );

    it.each([42, 180, 14])(
      "should return true if daysRemaining is %s but the banner was never dismissed",
      daysRemaining => {
        expect(
          shouldShowTrialBanner({
            tokenExpiryTimestamp: "2021-11-27",
            daysRemaining,
            lastDismissed: null,
          }),
        ).toBe(true);
      },
    );

    it.each([42, 180, 14])(
      "should return true if daysRemaining is %s but the banner dismissal information is not available",
      daysRemaining => {
        expect(
          shouldShowTrialBanner({
            tokenExpiryTimestamp: "2021-11-27",
            daysRemaining,
            lastDismissed: undefined,
          }),
        ).toBe(true);
      },
    );
  });

  describe("getCurrentUTCTimestamp", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should return the UTC timestamp from the UTC input", () => {
      jest.setSystemTime(new Date("2024-12-31T23:00:00.000Z"));
      expect(getCurrentUTCTimestamp()).toBe("2024-12-31T23:00:00.000Z");
    });

    it("should return return the UTC timestamp from any given timezone", () => {
      jest.setSystemTime(new Date("2024-12-15T00:00:00.000+07:00"));
      expect(getCurrentUTCTimestamp()).toBe("2024-12-14T17:00:00.000Z");
    });
  });
});
