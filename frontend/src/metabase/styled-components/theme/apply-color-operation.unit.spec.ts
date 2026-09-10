import { applyColorOperation } from "./dynamic-css-vars";

describe("applyColorOperation", () => {
  it("applies lighten operation", () => {
    const result = applyColorOperation("#ff0000", {
      lighten: 0.2,
    });

    expect(result).toBe("rgb(255, 51, 51)");
  });

  it("applies darken operation", () => {
    const result = applyColorOperation("#ff0000", {
      darken: 0.2,
    });

    expect(result).toBe("rgb(204, 0, 0)");
  });

  it("applies alpha operation", () => {
    const result = applyColorOperation("#ff0000", {
      alpha: 0.5,
    });

    expect(result).toBe("rgba(255, 0, 0, 0.5)");
  });

  it("does nothing if no operation exists", () => {
    expect(applyColorOperation("#00ff00", {})).toBe("#00ff00");
  });

  it("should handle all operations together", () => {
    const result = applyColorOperation("#333333", {
      lighten: 0.3,
      darken: 0.1,
      alpha: 0.7,
    });

    expect(result).toBe("rgba(59, 59, 59, 0.7)");
  });
});
