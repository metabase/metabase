import type { MetabaseTheme } from "metabase/embedding-sdk/theme";

import { stripDefaultThemeSettings } from "./strip-default-theme-settings";

const DEFAULTS: MetabaseTheme = {
  colors: {
    brand: "#509EE3",
    "text-primary": "#2E353B",
    background: "#FFFFFF",
    charts: ["#509EE3", "#88BF4D", "#A989C5"],
  },
};

describe("stripDefaultThemeSettings", () => {
  it("returns empty object when theme matches defaults", () => {
    const theme: MetabaseTheme = {
      colors: {
        brand: "#509EE3",
        "text-primary": "#2E353B",
        background: "#FFFFFF",
      },
    };

    expect(stripDefaultThemeSettings(theme, DEFAULTS)).toEqual({});
  });

  it("keeps colors that differ from defaults", () => {
    const theme: MetabaseTheme = {
      colors: {
        brand: "#FF0000",
        "text-primary": "#2E353B",
        background: "#FFFFFF",
      },
    };

    expect(stripDefaultThemeSettings(theme, DEFAULTS)).toEqual({
      colors: { brand: "#FF0000" },
    });
  });

  it("keeps multiple non-default colors", () => {
    const theme: MetabaseTheme = {
      colors: {
        brand: "#FF0000",
        "text-primary": "#000000",
        background: "#FFFFFF",
      },
    };

    expect(stripDefaultThemeSettings(theme, DEFAULTS)).toEqual({
      colors: { brand: "#FF0000", "text-primary": "#000000" },
    });
  });

  it("preserves non-color settings", () => {
    const theme: MetabaseTheme = {
      fontFamily: "Lato",
      fontSize: "16px",
      lineHeight: 1.5,
      preset: "dark",
      colors: {
        brand: "#509EE3",
      },
    };

    expect(stripDefaultThemeSettings(theme, DEFAULTS)).toEqual({
      fontFamily: "Lato",
      fontSize: "16px",
      lineHeight: 1.5,
      preset: "dark",
    });
  });

  it("keeps chart colors when they differ from defaults", () => {
    const theme: MetabaseTheme = {
      colors: {
        brand: "#509EE3",
        charts: ["#FF0000", "#00FF00", "#0000FF"],
      },
    };

    expect(stripDefaultThemeSettings(theme, DEFAULTS)).toEqual({
      colors: { charts: ["#FF0000", "#00FF00", "#0000FF"] },
    });
  });

  it("strips chart colors when they match defaults", () => {
    const theme: MetabaseTheme = {
      colors: {
        brand: "#509EE3",
        charts: ["#509EE3", "#88BF4D", "#A989C5"],
      },
    };

    expect(stripDefaultThemeSettings(theme, DEFAULTS)).toEqual({});
  });

  it("handles theme with no colors", () => {
    const theme: MetabaseTheme = {
      fontFamily: "Lato",
    };

    expect(stripDefaultThemeSettings(theme, DEFAULTS)).toEqual({
      fontFamily: "Lato",
    });
  });

  it("handles empty defaults", () => {
    const theme: MetabaseTheme = {
      colors: { brand: "#FF0000" },
    };

    expect(stripDefaultThemeSettings(theme, {})).toEqual({
      colors: { brand: "#FF0000" },
    });
  });
});
