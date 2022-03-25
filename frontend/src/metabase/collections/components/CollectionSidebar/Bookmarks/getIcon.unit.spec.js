import { getIcon } from "./getIcon";

describe("get icon to render alongside bookmark", () => {
  it("returns `display` if available", () => {
    expect(getIcon("display")).toBe("display");
  });

  describe("maps to icon that corresponds to type", () => {
    it("renders for generic card", () => {
      expect(getIcon(null, "card")).toBe("grid");
    });

    it("renders for collection", () => {
      expect(getIcon(null, "collection")).toBe("folder");
    });

    it("renders for dashboard", () => {
      expect(getIcon(null, "dashboard")).toBe("dashboard");
    });
  });
});
