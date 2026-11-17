import {
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import {
  createMockRecentCollectionItem,
  createMockSearchResult,
} from "metabase-types/api/mocks";

import { useDefaultPreviewResource } from "./use-default-preview-resource";

const setup = ({
  recents = [],
  searchItems = [],
}: {
  recents?: Parameters<typeof setupRecentViewsEndpoints>[0];
  searchItems?: Parameters<typeof setupSearchEndpoints>[0];
} = {}) => {
  setupRecentViewsEndpoints(recents);
  setupSearchEndpoints(searchItems);

  return renderHookWithProviders(() => useDefaultPreviewResource(), {});
};

describe("useDefaultPreviewResource", () => {
  it("returns the most recently viewed dashboard when available", async () => {
    const { result } = setup({
      recents: [
        createMockRecentCollectionItem({
          id: 42,
          model: "dashboard",
          name: "Recent dashboard",
        }),
        createMockRecentCollectionItem({
          id: 7,
          model: "card",
          name: "Recent question",
        }),
      ],
    });

    await waitFor(() => {
      expect(result.current.resource).toEqual({
        model: "dashboard",
        id: 42,
        name: "Recent dashboard",
      });
    });
    expect(result.current.isLoading).toBe(false);
  });

  it("falls back to the most recently viewed question when no dashboard is in recents", async () => {
    const { result } = setup({
      recents: [
        createMockRecentCollectionItem({
          id: 9,
          model: "card",
          name: "Recent question",
        }),
      ],
    });

    await waitFor(() => {
      expect(result.current.resource).toEqual({
        model: "card",
        id: 9,
        name: "Recent question",
      });
    });
    expect(result.current.isLoading).toBe(false);
  });

  it("falls back to search for a dashboard when recents is empty", async () => {
    const { result } = setup({
      recents: [],
      searchItems: [
        createMockSearchResult({
          id: 100,
          model: "dashboard",
          name: "Some dashboard",
        }),
        createMockSearchResult({
          id: 101,
          model: "card",
          name: "Some question",
        }),
      ],
    });

    await waitFor(() => {
      expect(result.current.resource).toEqual({
        model: "dashboard",
        id: 100,
        name: "Some dashboard",
      });
    });
    expect(result.current.isLoading).toBe(false);
  });

  it("falls back to search for a question when recents is empty and no dashboards exist", async () => {
    const { result } = setup({
      recents: [],
      searchItems: [
        createMockSearchResult({
          id: 200,
          model: "card",
          name: "Only question",
        }),
      ],
    });

    await waitFor(() => {
      expect(result.current.resource).toEqual({
        model: "card",
        id: 200,
        name: "Only question",
      });
    });
    expect(result.current.isLoading).toBe(false);
  });

  it("returns a null resource when no recents and no searchable content exist", async () => {
    const { result } = setup({ recents: [], searchItems: [] });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.resource).toBeNull();
  });
});
