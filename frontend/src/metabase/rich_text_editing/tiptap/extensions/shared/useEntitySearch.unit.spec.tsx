import {
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import { createMockSearchResult } from "metabase-types/api/mocks";

import { useEntitySearch } from "./useEntitySearch";

const noop = () => {};

const setup = (initialQuery: string) => {
  setupRecentViewsEndpoints([]);
  setupSearchEndpoints([
    createMockSearchResult({ id: 1, name: "Dashboard A", model: "dashboard" }),
  ]);

  return renderHookWithProviders(
    ({ query }: { query: string }) =>
      useEntitySearch({
        query,
        onSelectRecent: noop,
        onSelectSearchResult: noop,
        onSelectUser: noop,
        shouldFetchRecents: false,
        searchModels: ["dashboard"],
      }),
    { initialProps: { query: initialQuery } },
  );
};

describe("useEntitySearch", () => {
  it("reports loading and hides stale results while the query is settling, then fires the search with the settled query", async () => {
    const { result, rerender } = setup("");

    // Let the initial request settle.
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    rerender({ query: "Dashboard" });

    // Debounce window: loading, and the previous results are not surfaced.
    expect(result.current.isLoading).toBe(true);
    expect(result.current.searchResults).toEqual([]);

    // Once the query settles, the debounced search fires and results appear.
    await waitFor(() => expect(result.current.isLoading).toBe(false), {
      timeout: 3000,
    });
    expect(result.current.searchResults).toHaveLength(1);
    expect(result.current.searchResults[0].name).toBe("Dashboard A");
  });
});
