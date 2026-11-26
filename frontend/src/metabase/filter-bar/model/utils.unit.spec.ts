import { createTestPill } from "../test-utils";

import { isSameStages, pillToken } from "./utils";

describe("isSameStages", () => {
  it("treats pills that look the same as the same, even with new filter objects", () => {
    const before = [[pillToken({ id: 1 }, createTestPill("A"))]];
    const after = [[pillToken({ id: 1 }, createTestPill("A"))]];
    expect(isSameStages(before, after)).toBe(true);
  });

  it("tells pills that look different apart", () => {
    const before = [[pillToken("A", createTestPill("A"))]];
    const after = [[pillToken("A", createTestPill("B"))]];
    expect(isSameStages(before, after)).toBe(false);
  });
});
