import { userColor } from "./userColor";

describe("userColor", () => {
  it("is deterministic for the same user-id", () => {
    const first = userColor(42);
    for (let i = 0; i < 100; i++) {
      expect(userColor(42)).toBe(first);
    }
  });

  it("returns a hex color string", () => {
    expect(userColor(1)).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(userColor(12345)).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("spreads inputs across more than one palette entry", () => {
    // 10 arbitrary user-ids should land on at least 3 distinct colors.
    const ids = [1, 2, 3, 4, 5, 100, 200, 300, 9999, 54321];
    const distinct = new Set(ids.map(userColor));
    expect(distinct.size).toBeGreaterThanOrEqual(3);
  });
});
