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
  it("returns the search results for the current query", async () => {
    const { result } = setup("Dashboard");

    await waitFor(() =>
      expect(result.current.searchResults.map((item) => item.name)).toEqual([
        "Dashboard A",
      ]),
    );
  });

  it("debounces query changes into the search request", async () => {
    const { result, rerender } = setup("Dashboard");

    await waitFor(() => expect(result.current.searchResults).toHaveLength(1));

    // A changed query eventually drives the (debounced) search; a non-matching
    // query settles to no results.
    rerender({ query: "nonexistent-query" });

    await waitFor(() => expect(result.current.searchResults).toEqual([]));
  });
});
