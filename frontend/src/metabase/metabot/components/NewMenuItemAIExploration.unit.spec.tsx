import { getNewMenuItemAIExploration } from "./NewMenuItemAIExploration";

describe("getNewMenuItemAIExploration", () => {
  it("should return undefined when hasDataAccess is false", () => {
    const result = getNewMenuItemAIExploration(false, undefined, true);
    expect(result).toBeUndefined();
  });

  it("should return undefined when isMetabotEnabled is false", () => {
    const result = getNewMenuItemAIExploration(true, undefined, false);
    expect(result).toBeUndefined();
  });

  it("should return undefined when isMetabotEnabled is undefined", () => {
    const result = getNewMenuItemAIExploration(true, undefined, undefined);
    expect(result).toBeUndefined();
  });

  it("should return a Menu.Item when hasDataAccess and isMetabotEnabled are true", () => {
    const result = getNewMenuItemAIExploration(true, undefined, true);
    expect(result).not.toBeUndefined();
    expect(result?.key).toBe("nlq");
  });

  it("should link to the ask mode question page", () => {
    const result = getNewMenuItemAIExploration(true, 123, true);
    expect(result).not.toBeUndefined();
    expect(result?.props?.to).toBe("/question/ask");
  });
});
