import fetchMock from "fetch-mock";

import { act, renderHookWithProviders, waitFor } from "__support__/ui";
import type { EmbeddingTheme } from "metabase-types/api/embedding-theme";

import {
  type ThemeEditorId,
  useEmbeddingThemeEditor,
} from "./use-embedding-theme-editor";

const TEST_THEME: EmbeddingTheme = {
  id: 1,
  name: "My theme",
  settings: {
    colors: { brand: "#509EE3", background: "#ffffff" },
    fontFamily: "Roboto",
    fontSize: "14px",
  },
  color_harmony: "off",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

function setup(themeId: ThemeEditorId = 1) {
  if (typeof themeId === "number") {
    fetchMock.get(`path:/api/embed-theme/${themeId}`, TEST_THEME);
    fetchMock.put(`path:/api/embed-theme/${themeId}`, {
      ...TEST_THEME,
      name: "Updated",
    });
  }

  return renderHookWithProviders(() => useEmbeddingThemeEditor(themeId), {
    withUndos: true,
  });
}

describe("useEmbeddingThemeEditor", () => {
  afterEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
  });

  it("loads the theme and initializes state", async () => {
    const { result } = setup();

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.currentTheme?.name).toBe("My theme");
    expect(result.current.currentTheme?.settings.colors?.brand).toBe("#509EE3");
    expect(result.current.isDirty).toBe(false);
  });

  it("tracks dirty state when name changes", async () => {
    const { result } = setup();

    await waitFor(() => {
      expect(result.current.currentTheme).not.toBeNull();
    });

    act(() => {
      result.current.setName("New name");
    });

    expect(result.current.currentTheme?.name).toBe("New name");
    expect(result.current.isDirty).toBe(true);
  });

  it("tracks dirty state when a color changes", async () => {
    const { result } = setup();

    await waitFor(() => {
      expect(result.current.currentTheme).not.toBeNull();
    });

    act(() => {
      result.current.setColor("brand", "#FF0000");
    });

    expect(result.current.currentTheme?.settings.colors?.brand).toBe("#ff0000");
    expect(result.current.isDirty).toBe(true);
  });

  it("discards changes and reverts to pristine state", async () => {
    const { result } = setup();

    await waitFor(() => {
      expect(result.current.currentTheme).not.toBeNull();
    });

    act(() => {
      result.current.setName("Changed name");
    });

    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.handleDiscard();
    });

    expect(result.current.currentTheme?.name).toBe("My theme");
    expect(result.current.isDirty).toBe(false);
  });

  describe("additional colors reset", () => {
    const CUSTOM_ADDITIONAL_COLORS = {
      "text-secondary": "#AAAAAA",
      "text-tertiary": "#BBBBBB",
      border: "#CCCCCC",
      "background-secondary": "#DDDDDD",
      filter: "#EEEEEE",
      summarize: "#FFFFFF",
      positive: "#00FF00",
      negative: "#FF0000",
      shadow: "#333333",
    };

    const THEME_WITH_CUSTOM_COLORS: EmbeddingTheme = {
      ...TEST_THEME,
      settings: {
        ...TEST_THEME.settings,
        colors: {
          brand: "#FF0000",
          background: "#111111",
          "text-primary": "#222222",
          ...CUSTOM_ADDITIONAL_COLORS,
          charts: [
            "#A00",
            "#B00",
            "#C00",
            "#D00",
            "#E00",
            "#F00",
            "#100",
            "#200",
          ],
        },
      },
      color_harmony: "off",
    };

    function setupWithCustomColors() {
      fetchMock.get("path:/api/embed-theme/1", THEME_WITH_CUSTOM_COLORS);
      fetchMock.put("path:/api/embed-theme/1", THEME_WITH_CUSTOM_COLORS);

      return renderHookWithProviders(() => useEmbeddingThemeEditor(1), {
        withUndos: true,
      });
    }

    it("hasAdditionalColorChanges is false when colors match defaults", async () => {
      const { result } = setup();

      await waitFor(() => {
        expect(result.current.currentTheme).not.toBeNull();
      });

      // TEST_THEME has no additional colors set, so they're undefined/"",
      // but defaults come from useDefaultEmbeddingThemeSettings.
      // After a reset, hasAdditionalColorChanges should be false.
      act(() => {
        result.current.resetAdditionalColors();
      });

      expect(result.current.hasAdditionalColorChanges).toBe(false);
    });

    it("hasAdditionalColorChanges is true when an additional color differs", async () => {
      const { result } = setup();

      await waitFor(() => {
        expect(result.current.currentTheme).not.toBeNull();
      });

      act(() => {
        result.current.setColor("border", "#FF00FF");
      });

      expect(result.current.hasAdditionalColorChanges).toBe(true);
    });

    it("hasAdditionalColorChanges is true when chart colors differ", async () => {
      const { result } = setup();

      await waitFor(() => {
        expect(result.current.currentTheme).not.toBeNull();
      });

      act(() => {
        result.current.setChartColor(0, "#FF00FF");
      });

      expect(result.current.hasAdditionalColorChanges).toBe(true);
    });

    it("hasAdditionalColorChanges is false for main color changes only", async () => {
      const { result } = setup();

      await waitFor(() => {
        expect(result.current.currentTheme).not.toBeNull();
      });

      // Reset additional colors to defaults first
      act(() => {
        result.current.resetAdditionalColors();
      });

      // Change only a main color
      act(() => {
        result.current.setColor("brand", "#123456");
      });

      expect(result.current.hasAdditionalColorChanges).toBe(false);
    });

    it("resets additional and chart colors to defaults, preserving main colors", async () => {
      const { result } = setupWithCustomColors();

      await waitFor(() => {
        expect(result.current.currentTheme).not.toBeNull();
      });

      expect(result.current.hasAdditionalColorChanges).toBe(true);

      act(() => {
        result.current.resetAdditionalColors();
      });

      const colors = result.current.currentTheme?.settings.colors;

      // Main colors should remain unchanged
      expect(colors?.brand).toBe("#FF0000");
      expect(colors?.background).toBe("#111111");
      expect(colors?.["text-primary"]).toBe("#222222");

      // Additional colors should no longer be the custom values
      expect(colors?.["text-secondary"]).not.toBe("#AAAAAA");
      expect(colors?.border).not.toBe("#CCCCCC");
      expect(colors?.positive).not.toBe("#00FF00");

      // Chart colors should be reset
      expect(colors?.charts).not.toEqual([
        "#A00",
        "#B00",
        "#C00",
        "#D00",
        "#E00",
        "#F00",
        "#100",
        "#200",
      ]);

      expect(result.current.hasAdditionalColorChanges).toBe(false);
      expect(result.current.isDirty).toBe(true);
    });
  });

  describe("clearing font fields", () => {
    it("removes fontFamily from settings when cleared", async () => {
      const { result } = setup();

      await waitFor(() => {
        expect(result.current.currentTheme).not.toBeNull();
      });

      expect(result.current.currentTheme?.settings.fontFamily).toBe("Roboto");

      act(() => {
        result.current.setFontFamily("");
      });

      expect(
        "fontFamily" in (result.current.currentTheme?.settings ?? {}),
      ).toBe(false);
      expect(result.current.isDirty).toBe(true);
    });

    it("removes fontSize from settings when cleared", async () => {
      const { result } = setup();

      await waitFor(() => {
        expect(result.current.currentTheme).not.toBeNull();
      });

      expect(result.current.currentTheme?.settings.fontSize).toBe("14px");

      act(() => {
        result.current.setFontSize("");
      });

      expect("fontSize" in (result.current.currentTheme?.settings ?? {})).toBe(
        false,
      );
      expect(result.current.isDirty).toBe(true);
    });
  });

  describe("draft mode", () => {
    it("seeds state from defaults without calling GET", async () => {
      const { result } = setup("new");

      await waitFor(() => {
        expect(result.current.currentTheme).not.toBeNull();
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.currentTheme?.name).toBe("Untitled theme");
      expect(result.current.isDraft).toBe(true);

      expect(
        fetchMock.callHistory.calls(/\/api\/embed-theme\/\d+/),
      ).toHaveLength(0);
    });

    it("allows saving immediately even without changes", async () => {
      const { result } = setup("new");

      await waitFor(() => {
        expect(result.current.currentTheme).not.toBeNull();
      });

      expect(result.current.canSave).toBe(true);
    });

    it("reports isDirty only after the user makes a change", async () => {
      const { result } = setup("new");

      await waitFor(() => {
        expect(result.current.currentTheme).not.toBeNull();
      });

      expect(result.current.isDirty).toBe(false);

      act(() => {
        result.current.setName("Renamed");
      });

      expect(result.current.isDirty).toBe(true);
    });

    it("POSTs a new theme on save", async () => {
      fetchMock.post("path:/api/embed-theme", {
        ...TEST_THEME,
        id: 42,
        name: "Untitled theme",
      });

      const { result } = setup("new");

      await waitFor(() => {
        expect(result.current.currentTheme).not.toBeNull();
      });

      const saved = await result.current.handleSave();

      expect(saved?.id).toBe(42);
      expect(fetchMock.callHistory.calls("path:/api/embed-theme")).toHaveLength(
        1,
      );
    });
  });

  describe("color harmony", () => {
    it("seeds a draft with octagonal harmony and pre-derived colors", async () => {
      const { result } = setup("new");

      await waitFor(() => {
        expect(result.current.currentTheme).not.toBeNull();
      });

      expect(result.current.currentTheme?.colorHarmony).toBe("octagonal");
      const colors = result.current.currentTheme?.settings.colors;
      expect(colors?.filter).toBeDefined();
      expect(colors?.summarize).toBeDefined();
      expect(colors?.positive).toBeDefined();
      expect(colors?.negative).toBeDefined();
      expect(colors?.charts).toHaveLength(8);
    });

    it("loads color_harmony from the server theme", async () => {
      fetchMock.get("path:/api/embed-theme/2", {
        ...TEST_THEME,
        id: 2,
        color_harmony: "square",
      });

      const { result } = renderHookWithProviders(
        () => useEmbeddingThemeEditor(2),
        { withUndos: true },
      );

      await waitFor(() => {
        expect(result.current.currentTheme).not.toBeNull();
      });

      expect(result.current.currentTheme?.colorHarmony).toBe("square");
    });

    it("regenerates the derived palette when brand changes in a non-off mode", async () => {
      const { result } = setup("new");

      await waitFor(() => {
        expect(result.current.currentTheme).not.toBeNull();
      });

      const initialFilter =
        result.current.currentTheme?.settings.colors?.filter;
      const initialChart0 =
        result.current.currentTheme?.settings.colors?.charts?.[0];

      act(() => {
        result.current.setColor("brand", "#FF0000");
      });

      const newFilter = result.current.currentTheme?.settings.colors?.filter;
      const newChart0 =
        result.current.currentTheme?.settings.colors?.charts?.[0];
      expect(newFilter).not.toBe(initialFilter);
      expect(newChart0).not.toBe(initialChart0);
      expect(result.current.currentTheme?.colorHarmony).toBe("octagonal");
    });

    it("flips to off when a derived color is edited manually", async () => {
      const { result } = setup("new");

      await waitFor(() => {
        expect(result.current.currentTheme).not.toBeNull();
      });

      expect(result.current.currentTheme?.colorHarmony).toBe("octagonal");

      act(() => {
        result.current.setColor("filter", "#123456");
      });

      expect(result.current.currentTheme?.colorHarmony).toBe("off");
      expect(result.current.currentTheme?.settings.colors?.filter).toBe(
        "#123456",
      );
    });

    it("flips to off when a chart color is edited manually", async () => {
      const { result } = setup("new");

      await waitFor(() => {
        expect(result.current.currentTheme).not.toBeNull();
      });

      expect(result.current.currentTheme?.colorHarmony).toBe("octagonal");

      act(() => {
        result.current.setChartColor(2, "#abcdef");
      });

      expect(result.current.currentTheme?.colorHarmony).toBe("off");
      expect(result.current.currentTheme?.settings.colors?.charts?.[2]).toBe(
        "#abcdef",
      );
    });

    it("does not flip when a non-derived color is edited", async () => {
      const { result } = setup("new");

      await waitFor(() => {
        expect(result.current.currentTheme).not.toBeNull();
      });

      act(() => {
        result.current.setColor("border", "#abcdef");
      });

      expect(result.current.currentTheme?.colorHarmony).toBe("octagonal");
    });

    it("setColorHarmony to a non-off mode overwrites the derived palette", async () => {
      const { result } = setup();

      await waitFor(() => {
        expect(result.current.currentTheme).not.toBeNull();
      });

      // Seed with custom colors so we can detect the overwrite.
      act(() => {
        result.current.setColor("filter", "#ff00ff");
        result.current.setChartColor(0, "#ff00ff");
      });

      act(() => {
        result.current.setColorHarmony("octagonal");
      });

      expect(result.current.currentTheme?.colorHarmony).toBe("octagonal");
      expect(result.current.currentTheme?.settings.colors?.filter).not.toBe(
        "#ff00ff",
      );
      expect(
        result.current.currentTheme?.settings.colors?.charts?.[0],
      ).not.toBe("#ff00ff");
    });

    it("setColorHarmony to off only updates the mode, leaves colors", async () => {
      const { result } = setup("new");

      await waitFor(() => {
        expect(result.current.currentTheme).not.toBeNull();
      });

      const filterBefore = result.current.currentTheme?.settings.colors?.filter;

      act(() => {
        result.current.setColorHarmony("off");
      });

      expect(result.current.currentTheme?.colorHarmony).toBe("off");
      expect(result.current.currentTheme?.settings.colors?.filter).toBe(
        filterBefore,
      );
    });

    it("isDirty becomes true when only the harmony mode changes", async () => {
      const { result } = setup();

      await waitFor(() => {
        expect(result.current.currentTheme).not.toBeNull();
      });

      expect(result.current.isDirty).toBe(false);

      act(() => {
        result.current.setColorHarmony("octagonal");
      });

      expect(result.current.isDirty).toBe(true);
    });

    it("includes color_harmony in the save payload", async () => {
      fetchMock.post("path:/api/embed-theme", {
        ...TEST_THEME,
        id: 99,
      });

      const { result } = setup("new");

      await waitFor(() => {
        expect(result.current.currentTheme).not.toBeNull();
      });

      await result.current.handleSave();

      const post = fetchMock.callHistory.calls("path:/api/embed-theme")[0];
      const body = JSON.parse((post.options?.body as string) ?? "{}");
      expect(body.color_harmony).toBe("octagonal");
    });
  });

  it("reports isNotFound on API error", async () => {
    fetchMock.get("path:/api/embed-theme/999", 404);

    const { result } = renderHookWithProviders(
      () => useEmbeddingThemeEditor(999),
      {},
    );

    await waitFor(() => {
      expect(result.current.isNotFound).toBe(true);
    });
  });
});
