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

type SetupOpts = {
  enabled?: boolean;
};

function setup({ enabled = true }: SetupOpts = {}) {
  return renderHookWithProviders(() => useEntityPickerSearch(enabled), {});
}

describe("useEntityPickerSearch", () => {
  it("does not probe for measures and metrics until enabled", () => {
    setupSearchEndpoints([MEASURE]);

    setup({ enabled: false });

    expect(getSearchCalls()).toHaveLength(0);
  });

  it("probes with a count-only measure and metric search", async () => {
    setupSearchEndpoints([MEASURE]);

    setup();

    await waitFor(() => expect(getSearchCalls()).toHaveLength(1));
    const url = new URL(getSearchCalls()[0].url);
    expect(url.searchParams.getAll("models")).toEqual(["measure", "metric"]);
    expect(url.searchParams.get("limit")).toBe("0");
  });

  it("offers measures, metrics, and questions, but not models", () => {
    setupSearchEndpoints([MEASURE]);

    const { result } = setup();

    expect(result.current.models).toEqual(["measure", "metric", "card"]);
  });
});

function getSearchCalls() {
  return fetchMock.callHistory.calls("path:/api/search");
}
