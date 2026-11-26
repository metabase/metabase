import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionItemsEndpoint,
  setupDatabaseListEndpoint,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDatabase,
  createMockMeasure,
  createMockSearchResult,
  createMockSettings,
  createMockTable,
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
    // Unjustified type cast. FIXME
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

describe("MetricSearchDropdown > browsing measures", () => {
  const DATABASE = createMockDatabase({ id: 1, name: "Sample Database" });
  const TEST_MEASURE = createMockMeasure({
    id: 10,
    name: "Test Measure",
    table_id: 2,
  });
  const ORDERS_TABLE = createMockTable({
    id: 2,
    db_id: DATABASE.id,
    schema: "PUBLIC",
    name: "ORDERS",
    display_name: "Orders",
  });
  const PEOPLE_TABLE = createMockTable({
    id: 3,
    db_id: DATABASE.id,
    schema: "PUBLIC",
    name: "PEOPLE",
    display_name: "People",
  });

  function setupBrowsing() {
    mockGetBoundingClientRect();
    setupRecentViewsAndSelectionsEndpoints([]);
    setupDatabaseListEndpoint([DATABASE]);
    fetchMock.get(`path:/api/database/${DATABASE.id}/schemas`, ["PUBLIC"]);
    // Tables carry their measures only when the picker asks for them.
    fetchMock.get(
      `path:/api/database/${DATABASE.id}/schema/PUBLIC`,
      (call) => {
        const includeMeasures =
          new URL(call.url).searchParams.get("include_measures") === "true";
        return [
          includeMeasures
            ? { ...ORDERS_TABLE, measures: [TEST_MEASURE] }
            : ORDERS_TABLE,
          includeMeasures ? { ...PEOPLE_TABLE, measures: [] } : PEOPLE_TABLE,
        ];
      },
      { name: "schema-tables" },
    );
    fetchMock.get(
      "path:/api/collection/root",
      createMockCollection({ id: "root" }),
    );
    setupCollectionItemsEndpoint({
      collection: createMockCollection({ id: "root" }),
      collectionItems: [],
    });
    // The search result's collection
    fetchMock.get("path:/api/collection/1", createMockCollection({ id: 1 }));
    setupCollectionItemsEndpoint({
      collection: createMockCollection({ id: 1 }),
      collectionItems: [],
    });
    setupSearchEndpoints([
      createMockSearchResult({
        id: TEST_MEASURE.id,
        model: "measure",
        name: TEST_MEASURE.name,
        table_id: ORDERS_TABLE.id,
      }),
    ]);

    renderWithProviders(
      <MetricSearchDropdown
        searchQuery="Sample"
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />,
    );
  }

  function getPickerItem(name: string) {
    return screen.getByRole("link", { name: new RegExp(name) });
  }

  it("disables tables without measures when browsing database measures", async () => {
    setupBrowsing();

    await userEvent.click(await screen.findByText("Browse all"));
    expect(await screen.findByTestId("nested-item-picker")).toBeInTheDocument();
    await userEvent.click(await screen.findByText("Databases"));
    await userEvent.click(await screen.findByText("Sample Database"));

    await waitFor(() =>
      expect(getPickerItem("People")).toHaveAttribute("data-disabled", "true"),
    );
    expect(getPickerItem("Orders")).not.toHaveAttribute("data-disabled");
    const tablesUrl = new URL(
      fetchMock.callHistory.lastCall("schema-tables")?.url ?? "",
    );
    expect(tablesUrl.searchParams.get("include_measures")).toBe("true");

    const modal = screen.getByRole("dialog");
    await userEvent.type(within(modal).getByPlaceholderText("Search…"), "Test");
    expect(await within(modal).findByText("Test Measure")).toBeInTheDocument();
  });
});
