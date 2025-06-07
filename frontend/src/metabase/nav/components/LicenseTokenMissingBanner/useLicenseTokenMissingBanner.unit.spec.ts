import { shouldShowBanner } from "./useLicenseTokenMissingBanner";

describe("shouldShowBanner works correctly", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2024-03-20T00:00:00.000Z"));
  });

  it("should return false when not running EE build", () => {
    const result = shouldShowBanner({
      tokenStatus: null,
      lastDismissed: [],
      isEEBuild: false,
    });

    expect(result).toBe(false);
  });

  it("should return false when token status is not null", () => {
    const result = shouldShowBanner({
      tokenStatus: {
        status: "valid",
        valid: true,
      },
      lastDismissed: [],
      isEEBuild: true,
    });

    expect(result).toBe(false);
  });

  it("should return false when banner has been dismissed twice", () => {
    const result = shouldShowBanner({
      tokenStatus: null,
      lastDismissed: ["2024-03-19T00:00:00.000Z", "2024-03-20T00:00:00.000Z"],
      isEEBuild: true,
    });

    expect(result).toBe(false);
  });

  it("should return true when banner has never been dismissed", () => {
    const result = shouldShowBanner({
      tokenStatus: null,
      lastDismissed: [],
      isEEBuild: true,
    });

    expect(result).toBe(true);
  });

  it("should return false when banner was dismissed less than 14 days ago", () => {
    const result = shouldShowBanner({
      tokenStatus: null,
      lastDismissed: ["2024-03-10T00:00:00.000Z"],
      isEEBuild: true,
    });

    expect(result).toBe(false);
  });

  it("should return true when banner was dismissed more than 14 days ago", () => {
    const result = shouldShowBanner({
      tokenStatus: null,
      lastDismissed: ["2024-03-01T00:00:00.000Z"],
      isEEBuild: true,
    });

    expect(result).toBe(true);
  });
});
