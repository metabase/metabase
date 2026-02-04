import { describeTemporalInterval } from "./temporal_bucket";

describe("describeTemporalInterval", () => {
  it("should return 'Previous 7 days' when include-current is false", () => {
    const result = describeTemporalInterval(-7, "day", {
      "include-current": false,
    });
    expect(result).toBe("Previous 7 days");
  });

  it("should return 'Previous 7 days' when include-current is not specified", () => {
    const result = describeTemporalInterval(-7, "day", {});
    expect(result).toBe("Previous 7 days");
  });

  it("should return 'Previous 7 days' when opts is undefined", () => {
    const result = describeTemporalInterval(-7, "day");
    expect(result).toBe("Previous 7 days");
  });

  it("should return 'Previous 7 days or today' when include-current is true", () => {
    const result = describeTemporalInterval(-7, "day", {
      "include-current": true,
    });
    expect(result).toBe("Previous 7 days or today");
  });
});
