import { resolveFontSizeToPx } from "./resolve-font-size-to-px";

describe("resolveFontSizeToPx", () => {
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it("converts em to px using the base font size", () => {
    expect(resolveFontSizeToPx("0.893em", "14px")).toBe("12.5px");
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it("rounds to two decimal places", () => {
    expect(resolveFontSizeToPx("0.857em", "14px")).toBe("12px");
    expect(resolveFontSizeToPx("0.933em", "15px")).toBe("14px");
  });

  it("warns and returns px values unchanged", () => {
    expect(resolveFontSizeToPx("12.5px", "14px")).toBe("12.5px");
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("is not in em"),
    );
  });

  it("warns and returns the original value when no base font size is provided", () => {
    expect(resolveFontSizeToPx("0.893em")).toBe("0.893em");
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("is not provided"),
    );
  });

  it("warns and returns rem values unchanged", () => {
    expect(resolveFontSizeToPx("1rem", "14px")).toBe("1rem");
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("is not in em"),
    );
  });

  it("warns for unrecognized font-size units", () => {
    expect(resolveFontSizeToPx("inherit", "14px")).toBe("inherit");
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("is not in em"),
    );
  });

  it("warns and does not convert when baseFontSize is in em", () => {
    expect(resolveFontSizeToPx("0.893em", "0.875em")).toBe("0.893em");
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("is not in px"),
    );
  });

  it("warns and does not convert when baseFontSize is in rem", () => {
    expect(resolveFontSizeToPx("0.893em", "2rem")).toBe("0.893em");
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("is not in px"),
    );
  });
});
