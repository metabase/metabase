import { getThemeCodeSnippet } from "./get-theme-code-snippet";

describe("getThemeCodeSnippet", () => {
  it("formats settings as pretty-printed JSON", () => {
    const snippet = getThemeCodeSnippet({
      colors: { brand: "#509ee3" },
      fontFamily: "Lato",
    });

    expect(snippet).toBe(
      [
        "{",
        `  "colors": {`,
        `    "brand": "#509ee3"`,
        "  },",
        `  "fontFamily": "Lato"`,
        "}",
      ].join("\n"),
    );
  });

  it("strips empty color values so the snippet only includes set colors", () => {
    const snippet = getThemeCodeSnippet({
      colors: {
        brand: "#509ee3",
        background: "",
        "text-primary": undefined,
      },
    });

    const parsed = JSON.parse(snippet);
    expect(parsed.colors).toEqual({ brand: "#509ee3" });
  });

  it("keeps the chart colors array when populated", () => {
    const snippet = getThemeCodeSnippet({
      colors: { charts: ["#509ee3", "#88bf4d"] },
    });

    const parsed = JSON.parse(snippet);
    expect(parsed.colors.charts).toEqual(["#509ee3", "#88bf4d"]);
  });

  it("omits the colors key entirely when every color is empty", () => {
    const snippet = getThemeCodeSnippet({
      colors: { brand: "", background: "" },
      fontFamily: "Lato",
    });

    const parsed = JSON.parse(snippet);
    expect(parsed).toEqual({ fontFamily: "Lato" });
  });

  it("returns an empty object snippet when no settings are configured", () => {
    expect(getThemeCodeSnippet({})).toBe("{}");
  });
});
