import { uniqueId } from "./unique-id";

describe("uniqueId", () => {
  it("returns a different id on every call", () => {
    const first = uniqueId();
    const second = uniqueId();
    expect(first).not.toBe(second);
    expect(Number(second)).toBe(Number(first) + 1);
  });

  it("shares one counter between prefixed and plain ids", () => {
    const first = Number(uniqueId());
    expect(uniqueId("card-")).toBe(`card-${first + 1}`);
    expect(uniqueId()).toBe(String(first + 2));
  });
});
