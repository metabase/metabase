import Color from "color";
import fetchMock from "fetch-mock";

import { act, renderHookWithProviders, waitFor } from "__support__/ui";
import type { State } from "metabase/redux/store";
import { createMockState } from "metabase/redux/store/mocks";
import { performUndo } from "metabase/redux/undo";
import { suggestHarmonyColors } from "metabase/ui/colors/harmonies";
import type { EmbeddingTheme } from "metabase-types/api/embedding-theme";
import type { ColorSettings } from "metabase-types/api/settings";

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
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

function setup(themeId: ThemeEditorId = 1, applicationColors?: ColorSettings) {
  if (typeof themeId === "number") {
    fetchMock.get(`path:/api/embed-theme/${themeId}`, TEST_THEME);
    fetchMock.put(`path:/api/embed-theme/${themeId}`, {
      ...TEST_THEME,
      name: "Updated",
    });
  }

  const storeInitialState = applicationColors
    ? createMockState({
        settings: { values: { "application-colors": applicationColors } },
      } as Partial<State>)
    : undefined;

  return renderHookWithProviders(() => useEmbeddingThemeEditor(themeId), {
    withUndos: true,
    withRouter: true,
    storeInitialState,
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

  describe("hasOutOfSyncAdditionalColors", () => {
    it("is false on a fresh draft — additional colors are pre-seeded from the brand harmony", async () => {
      const { result } = setup("new");

      await waitFor(() => {
        expect(result.current.currentTheme).not.toBeNull();
      });

      expect(result.current.hasOutOfSyncAdditionalColors).toBe(false);
    });

    it("is false when filter / summarize / positive / negative / charts match the brand-derived harmony", async () => {
      const { result } = setup("new");

      await waitFor(() => {
        expect(result.current.currentTheme).not.toBeNull();
      });

      act(() => {
        result.current.regenerateAdditionalColorsFromBrand();
      });

      expect(result.current.hasOutOfSyncAdditionalColors).toBe(false);
    });

    it("is true when a harmony-managed color is edited away from the derived value", async () => {
      const { result } = setup("new");

      await waitFor(() => {
        expect(result.current.currentTheme).not.toBeNull();
      });

      act(() => {
        result.current.regenerateAdditionalColorsFromBrand();
      });
      expect(result.current.hasOutOfSyncAdditionalColors).toBe(false);

      act(() => {
        result.current.setColor("filter", "#123456");
      });

      expect(result.current.hasOutOfSyncAdditionalColors).toBe(true);
    });

    it("is true when a chart color is edited away from the derived value", async () => {
      const { result } = setup("new");

      await waitFor(() => {
        expect(result.current.currentTheme).not.toBeNull();
      });

      act(() => {
        result.current.regenerateAdditionalColorsFromBrand();
      });

      act(() => {
        result.current.setChartColor(3, "#abcdef");
      });

      expect(result.current.hasOutOfSyncAdditionalColors).toBe(true);
    });

    it("is true when the brand changes (derived values now stale)", async () => {
      const { result } = setup("new");

      await waitFor(() => {
        expect(result.current.currentTheme).not.toBeNull();
      });

      act(() => {
        result.current.regenerateAdditionalColorsFromBrand();
      });
      expect(result.current.hasOutOfSyncAdditionalColors).toBe(false);

      act(() => {
        result.current.setColor("brand", "#aa3322");
      });

      expect(result.current.hasOutOfSyncAdditionalColors).toBe(true);
    });

    it("ignores edits to non-derived colors like border", async () => {
      const { result } = setup("new");

      await waitFor(() => {
        expect(result.current.currentTheme).not.toBeNull();
      });

      act(() => {
        result.current.regenerateAdditionalColorsFromBrand();
      });
      expect(result.current.hasOutOfSyncAdditionalColors).toBe(false);

      act(() => {
        result.current.setColor("border", "#abcdef");
      });

      expect(result.current.hasOutOfSyncAdditionalColors).toBe(false);
    });
  });

  describe("regenerateAdditionalColorsFromBrand", () => {
    it("overwrites filter / summarize / positive / negative / charts with brand-derived values", async () => {
      const { result } = setup("new");

      await waitFor(() => {
        expect(result.current.currentTheme).not.toBeNull();
      });

      // Make derived colors stale by editing them.
      act(() => {
        result.current.setColor("filter", "#000001");
        result.current.setChartColor(0, "#000002");
      });

      const brand = result.current.currentTheme?.settings.colors?.brand ?? "";
      const expected = suggestHarmonyColors(brand);

      act(() => {
        result.current.regenerateAdditionalColorsFromBrand();
      });

      const colors = result.current.currentTheme?.settings.colors;
      expect(colors?.filter).toBe(expected.filter);
      expect(colors?.summarize).toBe(expected.summarize);
      expect(colors?.positive).toBe(expected.positive);
      expect(colors?.negative).toBe(expected.negative);
      expect(colors?.charts).toEqual(expected.charts);
    });

    it("queues an undo entry that restores the prior colors when invoked", async () => {
      const { result, store } = setup("new");

      await waitFor(() => {
        expect(result.current.currentTheme).not.toBeNull();
      });

      act(() => {
        result.current.setColor("filter", "#abc123");
      });
      const filterBefore = result.current.currentTheme?.settings.colors?.filter;
      expect(filterBefore).toBe("#abc123");

      await act(async () => {
        result.current.regenerateAdditionalColorsFromBrand();
      });

      expect(result.current.currentTheme?.settings.colors?.filter).not.toBe(
        filterBefore,
      );

      // The hook dispatched an undo entry; assert and trigger it programmatically.
      await waitFor(() => {
        expect(store.getState().undo).toHaveLength(1);
      });
      const undo = store.getState().undo[0];
      expect(undo.actionLabel).toBe("Undo");

      await act(async () => {
        // performUndo is a thunk; the test store wires thunk middleware at runtime.
        store.dispatch(performUndo(undo.id) as never);
      });

      expect(result.current.currentTheme?.settings.colors?.filter).toBe(
        filterBefore,
      );
    });

    it("derives the expected harmony for the Metabase brand color", async () => {
      const { result } = setup();

      await waitFor(() => {
        expect(result.current.currentTheme).not.toBeNull();
      });

      // TEST_THEME's brand is the canonical Metabase blue. Trigger the
      // generator and verify each derived color independently against the
      // harmony spec, without going through `suggestHarmonyColors` — this
      // catches regressions in either the algorithm or the wiring.
      const BRAND = "#509EE3";
      expect(result.current.currentTheme?.settings.colors?.brand).toBe(BRAND);

      await act(async () => {
        result.current.regenerateAdditionalColorsFromBrand();
      });

      const colors = result.current.currentTheme?.settings.colors;

      // Filter / summarize follow the square harmony at brand ± 90°.
      expect(colors?.filter).toBe(Color(BRAND).rotate(90).hex().toLowerCase());
      expect(colors?.summarize).toBe(
        Color(BRAND).rotate(-90).hex().toLowerCase(),
      );

      // Positive / negative anchor to fixed hues at lightness 50.
      expect(colors?.positive).toBe(
        Color(BRAND).hue(89).lightness(50).hex().toLowerCase(),
      );
      expect(colors?.negative).toBe(
        Color(BRAND).hue(359).lightness(50).hex().toLowerCase(),
      );

      // Charts: brand verbatim at index 0, then 45° rotations clockwise.
      const charts = colors?.charts as string[];
      expect(charts).toHaveLength(8);
      expect(charts[0]).toBe(BRAND.toLowerCase());
      for (let i = 1; i < 8; i++) {
        expect(charts[i]).toBe(
          Color(BRAND)
            .rotate(i * 45)
            .hex()
            .toLowerCase(),
        );
      }
    });
  });

  describe("resetMainColors", () => {
    it("resets brand / background / text-primary to defaults", async () => {
      const { result } = setup();

      await waitFor(() => {
        expect(result.current.currentTheme).not.toBeNull();
      });

      act(() => {
        result.current.setColor("brand", "#aa1111");
      });
      expect(result.current.hasMainColorChanges).toBe(true);

      act(() => {
        result.current.resetMainColors();
      });

      expect(result.current.hasMainColorChanges).toBe(false);
    });

    it("queues an undo entry that restores the prior main colors when invoked", async () => {
      const { result, store } = setup();

      await waitFor(() => {
        expect(result.current.currentTheme).not.toBeNull();
      });

      act(() => {
        result.current.setColor("brand", "#aa1111");
      });
      const brandBefore = result.current.currentTheme?.settings.colors?.brand;
      expect(brandBefore).toBe("#aa1111");

      await act(async () => {
        result.current.resetMainColors();
      });

      expect(result.current.currentTheme?.settings.colors?.brand).not.toBe(
        brandBefore,
      );

      await waitFor(() => {
        expect(store.getState().undo).toHaveLength(1);
      });
      const undo = store.getState().undo[0];

      await act(async () => {
        // performUndo is a thunk; the test store wires thunk middleware at runtime.
        store.dispatch(performUndo(undo.id) as never);
      });

      expect(result.current.currentTheme?.settings.colors?.brand).toBe(
        brandBefore,
      );
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

    it("preserves whitelabel-provided colors when seeding the draft", async () => {
      const whitelabel = {
        brand: "#8e44ad",
        filter: "#16a085",
        summarize: "#d35400",
        accent0: "#e74c3c",
        accent7: "#34495e",
      } satisfies ColorSettings;

      const { result } = setup("new", whitelabel);

      await waitFor(() => {
        expect(result.current.currentTheme).not.toBeNull();
      });

      const colors = result.current.currentTheme?.settings.colors;
      expect(colors?.brand).toBe(whitelabel.brand);
      expect(colors?.filter).toBe(whitelabel.filter);
      expect(colors?.summarize).toBe(whitelabel.summarize);
      expect(colors?.charts?.[0]).toBe(whitelabel.accent0);
      expect(colors?.charts?.[7]).toBe(whitelabel.accent7);
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
