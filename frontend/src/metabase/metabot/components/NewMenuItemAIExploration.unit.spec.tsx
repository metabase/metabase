import { getNewMenuItemAIExploration } from "./NewMenuItemAIExploration";

describe("getNewMenuItemAIExploration", () => {
  it("should return undefined when hasDataAccess is false", () => {
    const result = getNewMenuItemAIExploration(false, undefined, true);
    expect(result).toBeUndefined();
  });

  it("should link to the ask mode question page when hasNlqAccess is true", () => {
    const result = getNewMenuItemAIExploration(true, undefined, true);
    expect(result).not.toBeUndefined();
    expect(result?.props?.to).toBe("/question/ask");
  });

  it("should link to the research mode page when hasNlqAccess is false", () => {
    const result = getNewMenuItemAIExploration(true, undefined, false);
    expect(result).not.toBeUndefined();
    expect(result?.props?.to).toBe("/question/research");
  });
});
