import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { setupLibraryEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { defer } from "metabase/utils/promise";
import { checkNotNull } from "metabase/utils/types";
import type { CollectionItem } from "metabase-types/api";
import {
  createMockCollectionItem,
  createMockSearchResult,
  createMockSearchResults,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { DatasetsList } from "./DatasetsList";

const LIBRARY_ID = 50;

const LIBRARY_COLLECTION_ITEM = createMockCollectionItem({
  id: LIBRARY_ID,
  name: "Library",
  model: "collection",
  type: "library",
  is_library_root: true,
  location: "/",
});

interface SetupOpts {
  isLibraryDashboard?: boolean;
  hasLibraryFeature?: boolean;
  libraryResponse?: Promise<CollectionItem>;
}

function setup({
  isLibraryDashboard = false,
  hasLibraryFeature = true,
  libraryResponse,
}: SetupOpts = {}) {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({ library: hasLibraryFeature }),
  });
  if (hasLibraryFeature) {
    setupEnterpriseOnlyPlugin("library");
  }
  if (libraryResponse) {
    fetchMock.get("path:/api/ee/library", libraryResponse);
  } else {
    setupLibraryEndpoints(hasLibraryFeature, LIBRARY_COLLECTION_ITEM);
  }
  fetchMock.get("path:/api/activity/recents", { recents: [] });
  fetchMock.get(
    "path:/api/search",
    createMockSearchResults({
      items: [
        createMockSearchResult({ id: 10, name: "Revenue", model: "metric" }),
      ],
    }),
  );

  renderWithProviders(
    <DatasetsList
      search=""
      setDataSourceCollapsed={jest.fn()}
      dashboardId={7}
      isLibraryDashboard={isLibraryDashboard}
    />,
    { storeInitialState: createMockState({ settings }) },
  );
}

async function getSearchedCollectionParam() {
  await waitFor(() => {
    expect(fetchMock.callHistory.called("path:/api/search")).toBe(true);
  });
  const call = fetchMock.callHistory.lastCall("path:/api/search");
  return new URL(checkNotNull(call?.request?.url)).searchParams.get(
    "collection",
  );
}

function wasCalled(path: string) {
  return fetchMock.callHistory.called(`path:${path}`);
}

describe("DatasetsList", () => {
  afterEach(() => {
    reinitialize();
  });

  it("should wait for the Library, then search only within it, for a library dashboard", async () => {
    const library = defer<CollectionItem>();
    setup({ isLibraryDashboard: true, libraryResponse: library.promise });

    await waitFor(() => expect(wasCalled("/api/ee/library")).toBe(true));
    expect(screen.queryByText("No compatible results")).not.toBeInTheDocument();
    expect(wasCalled("/api/search")).toBe(false);

    library.resolve(LIBRARY_COLLECTION_ITEM);

    expect(await screen.findByText("Revenue")).toBeInTheDocument();
    expect(await getSearchedCollectionParam()).toBe(String(LIBRARY_ID));
    expect(wasCalled("/api/activity/recents")).toBe(false);
  });

  it("should offer recent items and search everywhere for a regular dashboard", async () => {
    setup();

    await waitFor(() => expect(wasCalled("/api/activity/recents")).toBe(true));
    expect(await getSearchedCollectionParam()).toBeNull();
    expect(wasCalled("/api/ee/library")).toBe(false);
  });

  it("should offer nothing for a library dashboard when the Library cannot be loaded", async () => {
    setup({ isLibraryDashboard: true, hasLibraryFeature: false });

    expect(
      await screen.findByText("No compatible results"),
    ).toBeInTheDocument();
    expect(wasCalled("/api/search")).toBe(false);
    expect(wasCalled("/api/activity/recents")).toBe(false);
  });
});
