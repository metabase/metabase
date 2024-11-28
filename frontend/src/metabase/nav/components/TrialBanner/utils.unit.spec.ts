import { calculateDaysUntilTokenExpiry, shouldShowBanner } from "./utils";

describe("shouldShowBanner", () => {
  it("should return false if daysRemaining is less than 0", () => {
    expect(shouldShowBanner({ now: "2021-01-01", daysRemaining: -1 })).toBe(
      false,
    );
  });

  it.each([3, 2, 1, 0])(
    "should return true if daysRemaining is %s but the banner was never dismissed",
    daysRemaining => {
      expect(shouldShowBanner({ now: "2021-11-27", daysRemaining })).toBe(true);
    },
  );

  it.each([3, 2, 1, 0])(
    "should return true if daysRemaining is %s but the banner was dismissed before that",
    daysRemaining => {
      expect(
        shouldShowBanner({
          now: "2021-11-27",
          daysRemaining,
          lastDismissed: "2021-11-26",
        }),
      ).toBe(true);
    },
  );

  it.each([3, 2, 1, 0])(
    "should return false if daysRemaining is %s and the banner was dismissed on that day",
    daysRemaining => {
      expect(
        shouldShowBanner({
          now: "2021-11-27",
          daysRemaining,
          lastDismissed: "2021-11-27",
        }),
      ).toBe(false);
    },
  );

  it.each([3, 2, 1, 0])(
    "should return false if daysRemaining is %s and the banner was dismissed on that day including the time zone difference",
    daysRemaining => {
      expect(
        shouldShowBanner({
          now: "2024-11-28T20:49:05.089+23:00",
          daysRemaining,
          lastDismissed: "2024-11-27T20:49:05.089Z",
        }),
      ).toBe(false);
    },
  );

  it.each([42, 180, 14])(
    "should return false if daysRemaining is %s and the banner was dismissed at any point in the past",
    daysRemaining => {
      expect(
        shouldShowBanner({
          now: "2021-11-27",
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
        shouldShowBanner({
          now: "2021-11-27",
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
        shouldShowBanner({
          now: "2021-11-27",
          daysRemaining,
          lastDismissed: undefined,
        }),
      ).toBe(true);
    },
  );
});

describe("calculateDaysUntilTokenExpiry", () => {
  it("should return the correct number of days remaining", () => {
    expect(
      calculateDaysUntilTokenExpiry({
        currentTime: "2021-11-27",
        tokenExpiry: "2021-11-30",
      }),
    ).toBe(3);
  });

  it("should return a negative value if the token already expired", () => {
    expect(
      calculateDaysUntilTokenExpiry({
        currentTime: "2021-12-01",
        tokenExpiry: "2021-11-30",
      }),
    ).toBe(-1);
  });

  it("should return 0 if the token expires today", () => {
    expect(
      calculateDaysUntilTokenExpiry({
        currentTime: "2021-11-30",
        tokenExpiry: "2021-11-30",
      }),
    ).toBe(0);
  });

  it("should return 0 if the token expires today including the time zone difference with the positive offset", () => {
    expect(
      calculateDaysUntilTokenExpiry({
        currentTime: "2024-11-28T20:49:05.089+23:00",
        tokenExpiry: "2024-11-28T20:49:05.089Z",
      }),
    ).toBe(0);
  });

  it("should return 0 if the token expires today including the time zone difference with the negative offset", () => {
    expect(
      calculateDaysUntilTokenExpiry({
        currentTime: "2024-11-28T20:49:05.089-02:00",
        tokenExpiry: "2024-11-28T20:49:05.089Z",
      }),
    ).toBe(0);
  });
});
