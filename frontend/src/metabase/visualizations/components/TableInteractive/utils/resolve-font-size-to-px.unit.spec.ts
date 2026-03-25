import { resolveFontSizeToPx } from "./resolve-font-size-to-px";

describe("resolveFontSizeToPx", () => {
  it("converts em to px using the base font size", () => {
    expect(resolveFontSizeToPx("0.893em", "14px")).toBe("12.5px");
  });

  it("rounds to two decimal places", () => {
    expect(resolveFontSizeToPx("0.857em", "14px")).toBe("12px");
    expect(resolveFontSizeToPx("0.933em", "15px")).toBe("14px");
  });

  it("returns px values unchanged", () => {
    expect(resolveFontSizeToPx("12.5px", "14px")).toBe("12.5px");
  });

  it("returns the original value when no base font size is provided", () => {
    expect(resolveFontSizeToPx("0.893em")).toBe("0.893em");
  });

  it("does not convert rem values", () => {
    expect(resolveFontSizeToPx("1rem", "14px")).toBe("1rem");
  });

  it("returns the original value for non-numeric values", () => {
    expect(resolveFontSizeToPx("inherit", "14px")).toBe("inherit");
  });

  it("does not convert when baseFontSize is in em", () => {
    expect(resolveFontSizeToPx("0.893em", "0.875em")).toBe("0.893em");
  });

  it("does not convert when baseFontSize is in rem", () => {
    expect(resolveFontSizeToPx("0.893em", "2rem")).toBe("0.893em");
  });
});
