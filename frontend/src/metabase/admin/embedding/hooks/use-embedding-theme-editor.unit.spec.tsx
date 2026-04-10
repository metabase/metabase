import fetchMock from "fetch-mock";

import { act, renderHookWithProviders, waitFor } from "__support__/ui";
import type { EmbeddingTheme } from "metabase-types/api/embedding-theme";

import { useEmbeddingThemeEditor } from "./use-embedding-theme-editor";

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

function setup(themeId = 1) {
  fetchMock.get(`path:/api/embed-theme/${themeId}`, TEST_THEME);
  fetchMock.put(`path:/api/embed-theme/${themeId}`, {
    ...TEST_THEME,
    name: "Updated",
  });

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

    expect(result.current.currentTheme?.settings.colors?.brand).toBe("#FF0000");
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
