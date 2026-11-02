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
const METRIC = createMockSearchResult({
  id: 7,
  model: "metric",
  name: "Active users",
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
  it("does not probe for measures and metrics until enabled", () => {
    setupSearchEndpoints([MEASURE]);

    const { result } = setup(false);

    expect(getSearchCalls()).toHaveLength(0);
    expect(result.current.models).toEqual(["measure", "metric"]);
  });

  it("probes with a count-only measure and metric search", async () => {
    setupSearchEndpoints([MEASURE]);

    setup();

    await waitFor(() => expect(getSearchCalls()).toHaveLength(1));
    const url = new URL(getSearchCalls()[0].url);
    expect(url.searchParams.getAll("models")).toEqual(["measure", "metric"]);
    expect(url.searchParams.get("limit")).toBe("0");
  });

  // questions are reachable through "Browse all"
  it("searches measures and metrics, but not questions, when the instance has measures", async () => {
    setupSearchEndpoints([MEASURE, QUESTION]);

    const { result } = setup();

    await waitFor(() => expect(getSearchCalls()).toHaveLength(1));
    expect(result.current.models).toEqual(["measure", "metric"]);
  });

  it("searches measures and metrics, but not questions, when the instance has only metrics", async () => {
    setupSearchEndpoints([METRIC, QUESTION]);

    const { result } = setup();

    await waitFor(() => expect(getSearchCalls()).toHaveLength(1));
    expect(result.current.models).toEqual(["measure", "metric"]);
  });

  // models can't be goal sources
  it("falls back to questions, but not models, when the instance has no measures or metrics", async () => {
    setupSearchEndpoints([QUESTION]);

    const { result } = setup();

    await waitFor(() => expect(result.current.models).toEqual(["card"]));
  });

  it("caps results without filtering by ids, which the search API rejects for several models", async () => {
    setupSearchEndpoints([QUESTION]);

    const { result } = setup();

    await waitFor(() => expect(result.current.models).toEqual(["card"]));
    expect(result.current.searchParams).toEqual({ limit: 5 });
  });
});
