import fetchMock from "fetch-mock";

import { renderHookWithProviders, waitFor } from "__support__/ui";
import type { State } from "metabase/redux/store";
import { createMockState } from "metabase/redux/store/mocks";

import { useEnsureDefaultEmbeddingThemes } from "./use-ensure-default-embedding-themes";

function setup({ alreadySeeded }: { alreadySeeded: boolean }) {
  fetchMock.post("path:/api/embed-theme/seed-defaults", 204);

  const initialState = createMockState({
    settings: {
      values: { "default-embedding-themes-seeded": alreadySeeded },
    },
  } as Partial<State>);

  return renderHookWithProviders(() => useEnsureDefaultEmbeddingThemes(), {
    storeInitialState: initialState,
  });
}

describe("useEnsureDefaultEmbeddingThemes", () => {
  afterEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
  });

  it("posts default themes once when the setting is not yet seeded", async () => {
    setup({ alreadySeeded: false });

    await waitFor(() => {
      const calls = fetchMock.callHistory.calls(
        "path:/api/embed-theme/seed-defaults",
      );
      expect(calls).toHaveLength(1);
    });

    const [call] = fetchMock.callHistory.calls(
      "path:/api/embed-theme/seed-defaults",
    );
    const body = JSON.parse(call?.options?.body as string);
    expect(body.themes).toHaveLength(2);
    expect(body.themes.map((t: { name: string }) => t.name)).toEqual([
      "Light",
      "Dark",
    ]);
    expect(body.themes[0].settings.colors).toBeDefined();
  });

  it("does not post when the setting is already true", async () => {
    const { rerender } = setup({ alreadySeeded: true });

    // give effects a chance to run
    rerender();

    const calls = fetchMock.callHistory.calls(
      "path:/api/embed-theme/seed-defaults",
    );
    expect(calls).toHaveLength(0);
  });

  it("does not retry on subsequent renders of the same mount", async () => {
    const { rerender } = setup({ alreadySeeded: false });

    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls("path:/api/embed-theme/seed-defaults"),
      ).toHaveLength(1);
    });

    rerender();
    rerender();

    expect(
      fetchMock.callHistory.calls("path:/api/embed-theme/seed-defaults"),
    ).toHaveLength(1);
  });

  it("does not post while the setting has not hydrated", () => {
    fetchMock.post("path:/api/embed-theme/seed-defaults", 204);

    const initialState = createMockState({
      settings: { values: {} },
    } as Partial<State>);

    renderHookWithProviders(() => useEnsureDefaultEmbeddingThemes(), {
      storeInitialState: initialState,
    });

    expect(
      fetchMock.callHistory.calls("path:/api/embed-theme/seed-defaults"),
    ).toHaveLength(0);
  });
});
