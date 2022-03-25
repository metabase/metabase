import { getIcon } from "./getIcon";

describe("get icon to render alongside bookmark", () => {
  it("returns `display` if available", () => {
    expect(getIcon({ display: "display" })).toBe("display");
  });

  describe("for collections", () => {
    it("renders badge icon if collection is official", () => {
      expect(getIcon({ type: "collection", authority_level: "official" })).toBe(
        "badge",
      );
    });

    it("renders folder icon if collection is not official", () => {
      expect(getIcon({ type: "collection" })).toBe("folder");
    });
  });

  describe("maps to icon that corresponds to type", () => {
    it("renders for generic card", () => {
      expect(getIcon({ type: "card" })).toBe("grid");
    });

    it("renders for dashboard", () => {
      expect(getIcon({ type: "dashboard" })).toBe("dashboard");
    });
  });
});
