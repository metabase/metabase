import { getNewMenuItemAIExploration } from "./NewMenuItemAIExploration";

describe("getNewMenuItemAIExploration", () => {
  it("should return undefined when hasDataAccess is false", () => {
    const result = getNewMenuItemAIExploration(false, true);
    expect(result).toBeUndefined();
  });

  it("should return undefined when canUseNlq is false", () => {
    const result = getNewMenuItemAIExploration(true, false);
    expect(result).toBeUndefined();
  });

  it("should return undefined when canUseNlq is undefined", () => {
    const result = getNewMenuItemAIExploration(true, undefined);
    expect(result).toBeUndefined();
  });

  it("should return a Menu.Item when hasDataAccess and canUseNlq are true", () => {
    const result = getNewMenuItemAIExploration(true, true);
    expect(result).not.toBeUndefined();
    expect(result?.key).toBe("nlq");
  });

  it("should link to the home page", () => {
    const result = getNewMenuItemAIExploration(true, true);
    expect(result).not.toBeUndefined();
    expect(result?.props?.to).toBe("/");
  });
});
