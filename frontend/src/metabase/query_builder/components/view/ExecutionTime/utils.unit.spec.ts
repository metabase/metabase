import { formatDuration } from "./utils";

describe("formatDuration", () => {
  it("formats duration correctly", () => {
    expect(formatDuration(100)).toBe("100 ms");
    expect(formatDuration(999)).toBe("999 ms");
    expect(formatDuration(1000)).toBe("1.0 s");
    expect(formatDuration(1425)).toBe("1.4 s");
    expect(formatDuration(1475)).toBe("1.5 s");
    expect(formatDuration(1500)).toBe("1.5 s");
    expect(formatDuration(120000)).toBe("120.0 s");
  });
});
