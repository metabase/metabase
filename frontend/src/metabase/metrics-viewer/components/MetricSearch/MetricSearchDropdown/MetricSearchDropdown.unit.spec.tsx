import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionItemsEndpoint,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  waitFor,
} from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockSearchResult,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { MetricSearchDropdown } from "./MetricSearchDropdown";

const LIBRARY_COLLECTION = createMockCollection({
  id: 1,
  name: "Library",
  type: "library",
  below: ["metric"],
});

const LIBRARY_METRICS_COLLECTION = createMockCollectionItem({
  id: 2,
  name: "Metrics",
  model: "collection",
  type: "library-metrics",
  here: ["metric"],
});

function setup() {
  mockGetBoundingClientRect();

  fetchMock.get("path:/api/ee/library", LIBRARY_COLLECTION, {
    delay: 100,
  });
  setupCollectionItemsEndpoint({
    collection: LIBRARY_COLLECTION,
    collectionItems: [LIBRARY_METRICS_COLLECTION],
  });
  setupSearchEndpoints([
    createMockSearchResult({
      id: 1,
      model: "metric",
      name: "Revenue",
      collection: {
        id: LIBRARY_METRICS_COLLECTION.id,
        name: LIBRARY_METRICS_COLLECTION.name,
        archived: false,
      },
    }),
  ]);

  const settings = mockSettings(
    createMockSettings({
      "token-features": createMockTokenFeatures({ library: true }),
    }),
  );
  setupEnterprisePlugins();

  renderWithProviders(
    <MetricSearchDropdown
      searchQuery=""
      onSelect={jest.fn()}
      onClose={jest.fn()}
    />,
    { storeInitialState: { settings } },
  );
}

describe("MetricSearchDropdown", () => {
  afterEach(() => {
    reinitialize();
  });

  it("waits for library metric search scope before searching", async () => {
    setup();

    expect(fetchMock.callHistory.calls("path:/api/search")).toHaveLength(0);

    await waitFor(() => {
      expect(fetchMock.callHistory.calls("path:/api/search")).toHaveLength(1);
    });

    const searchCall = fetchMock.callHistory.lastCall("path:/api/search");
    const searchUrl = new URL(searchCall?.url as string);

    expect(searchUrl.searchParams.get("q")).toBe("");
    expect(searchUrl.searchParams.getAll("models")).toEqual([
      "metric",
      "measure",
    ]);
    expect(searchUrl.searchParams.get("collection")).toBe(
      String(LIBRARY_METRICS_COLLECTION.id),
    );
  });
});
