import fetchMock from "fetch-mock";

import { setupSearchEndpoints } from "__support__/server-mocks";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import { createMockSearchResult } from "metabase-types/api/mocks";

import { useEntityPickerSearch } from "./use-entity-picker-search";

const MEASURE = createMockSearchResult({
  id: 4,
  model: "measure",
  name: "Revenue",
});
const QUESTION = createMockSearchResult({
  id: 1,
  model: "card",
  name: "Orders",
});

function setup(enabled = true) {
  return renderHookWithProviders(() => useEntityPickerSearch(enabled), {});
}

function getSearchCalls() {
  return fetchMock.callHistory.calls("path:/api/search");
}

describe("useEntityPickerSearch", () => {
  it("does not probe for measures until enabled", () => {
    setupSearchEndpoints([MEASURE]);

    const { result } = setup(false);

    expect(getSearchCalls()).toHaveLength(0);
    expect(result.current.models).toEqual(["measure"]);
  });

  it("probes with a count-only measure search", async () => {
    setupSearchEndpoints([MEASURE]);

    setup();

    await waitFor(() => expect(getSearchCalls()).toHaveLength(1));
    const url = new URL(getSearchCalls()[0].url);
    expect(url.searchParams.getAll("models")).toEqual(["measure"]);
    expect(url.searchParams.get("limit")).toBe("0");
  });

  it("searches measures when the instance has any", async () => {
    setupSearchEndpoints([MEASURE, QUESTION]);

    const { result } = setup();

    await waitFor(() => expect(getSearchCalls()).toHaveLength(1));
    expect(result.current.models).toEqual(["measure"]);
  });

  it("falls back to questions and metrics, but not models, when the instance has no measures", async () => {
    setupSearchEndpoints([QUESTION]);

    const { result } = setup();

    await waitFor(() =>
      expect(result.current.models).toEqual(["card", "metric"]),
    );
  });

  it("caps results without filtering by ids, which the search API rejects for several models", async () => {
    setupSearchEndpoints([QUESTION]);

    const { result } = setup();

    await waitFor(() =>
      expect(result.current.models).toEqual(["card", "metric"]),
    );
    expect(result.current.searchParams).toEqual({ limit: 5 });
  });
});
