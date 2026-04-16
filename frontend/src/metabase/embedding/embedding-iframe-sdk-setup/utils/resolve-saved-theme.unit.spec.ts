import type { EmbeddingTheme } from "metabase-types/api/embedding-theme";

import type { SdkIframeEmbedSetupTheme } from "../types";

import { resolveSavedTheme } from "./resolve-saved-theme";

const SAVED_THEMES: EmbeddingTheme[] = [
  {
    id: 1,
    name: "Dark",
    settings: {
      colors: {
        brand: "#BB86FC",
        "text-primary": "#FFFFFF",
        background: "#121212",
      },
      fontFamily: "Inter",
    },
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: 2,
    name: "Ocean",
    settings: {
      colors: { brand: "#0077B6" },
    },
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
];

describe("resolveSavedTheme", () => {
  it("returns undefined when no theme is set", () => {
    expect(
      resolveSavedTheme({ theme: undefined, savedThemes: SAVED_THEMES }),
    ).toBeUndefined();
  });

  it("returns the raw theme when there is no id", () => {
    const theme: SdkIframeEmbedSetupTheme = { colors: { brand: "#FF0000" } };

    expect(
      resolveSavedTheme({ theme, savedThemes: SAVED_THEMES }),
    ).toStrictEqual(theme);
  });

  it("returns the raw theme when the id does not match any saved theme", () => {
    const theme: SdkIframeEmbedSetupTheme = { id: 999 };

    expect(
      resolveSavedTheme({ theme, savedThemes: SAVED_THEMES }),
    ).toStrictEqual(theme);
  });

  it("returns the raw theme when savedThemes is still loading", () => {
    const theme: SdkIframeEmbedSetupTheme = { id: 1 };

    expect(resolveSavedTheme({ theme, savedThemes: undefined })).toStrictEqual(
      theme,
    );
  });

  it("resolves the saved theme when only an id is set", () => {
    const resolved = resolveSavedTheme({
      theme: { id: 1 },
      savedThemes: SAVED_THEMES,
    });

    expect(resolved).toStrictEqual({
      id: 1,
      colors: {
        brand: "#BB86FC",
        "text-primary": "#FFFFFF",
        background: "#121212",
      },
      fontFamily: "Inter",
    });
  });

  it("merges inline colors on top of the saved theme, with inline values winning", () => {
    const resolved = resolveSavedTheme({
      theme: { id: 1, colors: { brand: "#FF0000" } },
      savedThemes: SAVED_THEMES,
    });

    expect(resolved?.colors).toStrictEqual({
      brand: "#FF0000",
      "text-primary": "#FFFFFF",
      background: "#121212",
    });
  });

  it("lets inline top-level overrides (e.g. fontFamily) win over the saved theme", () => {
    const resolved = resolveSavedTheme({
      theme: { id: 1, fontFamily: "Roboto" },
      savedThemes: SAVED_THEMES,
    });

    expect(resolved?.fontFamily).toBe("Roboto");
  });

  it("handles saved themes without a colors map", () => {
    const saved: EmbeddingTheme[] = [
      {
        id: 3,
        name: "Bare",
        settings: { fontFamily: "Lato" },
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      },
    ];

    const resolved = resolveSavedTheme({
      theme: { id: 3, colors: { brand: "#00FF00" } },
      savedThemes: saved,
    });

    expect(resolved).toStrictEqual({
      id: 3,
      fontFamily: "Lato",
      colors: { brand: "#00FF00" },
    });
  });
});
