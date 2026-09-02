import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { useState } from "react";

import { setupCollectionItemsEndpoint } from "__support__/server-mocks";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import * as Analytics from "metabase/analytics";
import { Api } from "metabase/api";
import { Route } from "metabase/router";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import type {
  Collection,
  CollectionId,
  CollectionItem,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import { CollectionItemsTable } from "./CollectionItemsTable";
import { ALL_MODELS } from "./constants";

const collection = createMockCollection({ id: 1, can_write: false });

function createFillerItems(
  count: number,
  overrides: Partial<CollectionItem> = {},
) {
  const model = overrides.model ?? "card";
  return Array.from({ length: count }, (_, index) =>
    createMockCollectionItem({
      collection_id: collection.id,
      ...overrides,
      id: 100 + index,
      model,
      name: `Extra ${model} ${index + 1}`,
    }),
  );
}

const collectionItems = [
  createMockCollectionItem({
    id: 1,
    collection_id: collection.id,
    model: "dashboard",
    name: "Revenue overview",
  }),
  createMockCollectionItem({
    id: 2,
    collection_id: collection.id,
    model: "card",
    name: "Customer 360",
  }),
  createMockCollectionItem({
    id: 3,
    collection_id: collection.id,
    model: "dataset",
    name: "Orders model",
  }),
  // Enough items to keep the search input and type filters visible.
  ...createFillerItems(9),
];

type SetupOpts = {
  collection?: Collection;
  collectionItems?: CollectionItem[];
  pageSize?: number;
  showFilterBar?: boolean;
};

function getTable({
  collection: currentCollection = collection,
  pageSize,
  showFilterBar = true,
}: Omit<SetupOpts, "collectionItems"> = {}) {
  return (
    <Route
      path="/"
      element={
        <CollectionItemsTable
          collection={currentCollection}
          collectionId={currentCollection.id}
          pageSize={pageSize}
          showFilterBar={showFilterBar}
        />
      }
    />
  );
}

function setup({
  collection: currentCollection = collection,
  collectionItems: items = collectionItems,
  pageSize,
  showFilterBar = true,
}: SetupOpts = {}) {
  setupCollectionItemsEndpoint({
    collection: currentCollection,
    collectionItems: items,
  });

  return renderWithProviders(
    getTable({ collection: currentCollection, pageSize, showFilterBar }),
    {
      withRouter: true,
      withDND: true,
    },
  );
}

function getItemsCalls(collectionId: CollectionId = collection.id) {
  return fetchMock.callHistory.calls(
    `path:/api/collection/${collectionId}/items`,
  );
}

function getMetadataCalls(collectionId: CollectionId = collection.id) {
  return fetchMock.callHistory.calls(
    `path:/api/collection/${collectionId}/items/metadata`,
  );
}

function getSearchCalls(collectionId: CollectionId = collection.id) {
  return getItemsCalls(collectionId).filter((call) =>
    new URL(call.url).searchParams.has("q"),
  );
}

function getItemsSearchParams() {
  return getItemsCalls().map((call) => new URL(call.url).searchParams);
}

function findItemsSearchParamsByModels(models: string[]) {
  const sortedModels = [...models].sort();

  return getItemsSearchParams().find(
    (searchParams) =>
      JSON.stringify(searchParams.getAll("models").sort()) ===
      JSON.stringify(sortedModels),
  );
}

function setupUserWithFakeTimers() {
  jest.useFakeTimers();
  return userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
}

function advanceSearchDebounce(duration = SEARCH_DEBOUNCE_DURATION) {
  act(() => {
    jest.advanceTimersByTime(duration);
  });
}

function CollectionNavigationTest({
  nextCollection,
}: {
  nextCollection: Collection;
}) {
  const [currentCollection, setCurrentCollection] = useState(collection);

  return (
    <>
      <button onClick={() => setCurrentCollection(nextCollection)}>
        Open next collection
      </button>
      <CollectionItemsTable
        collection={currentCollection}
        collectionId={currentCollection.id}
        showFilterBar
      />
    </>
  );
}

describe("CollectionItemsTable", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("renders the search toolbar when enabled", async () => {
    setup();

    expect(
      await screen.findByPlaceholderText("Search by name or editor..."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("collection-items-toolbar")).toBeInTheDocument();
  });

  it("does not render the search toolbar when it is not enabled", async () => {
    setup({ showFilterBar: false });

    expect(await screen.findByText("Revenue overview")).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Search by name or editor..."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("collection-items-toolbar"),
    ).not.toBeInTheDocument();
    expect(getMetadataCalls()).toHaveLength(0);
  });

  it("hides the search input and type filter when the list has 10 or fewer items", async () => {
    const pinnedDashboards = [1, 2].map((position) =>
      createMockCollectionItem({
        id: 200 + position,
        collection_id: collection.id,
        model: "dashboard",
        name: `Pinned dashboard ${position}`,
        collection_position: position,
      }),
    );
    setup({
      collectionItems: [...createFillerItems(8), ...pinnedDashboards],
    });

    expect(await screen.findByText("Extra card 1")).toBeInTheDocument();
    expect(screen.getByText("Pinned dashboard 1")).toBeInTheDocument();
    expect(
      screen.queryByTestId("collection-items-toolbar"),
    ).not.toBeInTheDocument();
  });

  it("ignores item types the list never shows when deciding to show the filters", async () => {
    setup({
      collectionItems: [
        createMockCollectionItem({
          id: 300,
          collection_id: collection.id,
          model: "collection",
          name: "Visible child",
        }),
        // Transforms are a model the backend can list, but the collection page never asks for.
        ...createFillerItems(10, { model: "transform" }),
      ],
    });

    expect(await screen.findByText("Visible child")).toBeInTheDocument();
    const metadataParams = new URL(getMetadataCalls()[0].url).searchParams;
    expect(metadataParams.getAll("models")).toEqual(ALL_MODELS);
    expect(
      screen.queryByTestId("collection-items-toolbar"),
    ).not.toBeInTheDocument();
  });

  it("shows the search input and type filter once the list exceeds 10 items, counting pinned ones", async () => {
    const pinnedDashboards = [1, 2].map((position) =>
      createMockCollectionItem({
        id: 200 + position,
        collection_id: collection.id,
        model: "dashboard",
        name: `Pinned dashboard ${position}`,
        collection_position: position,
      }),
    );
    setup({
      collectionItems: [...createFillerItems(9), ...pinnedDashboards],
    });

    expect(
      await screen.findByTestId("collection-items-toolbar"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Search by name or editor..."),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("collection-type-filter-button"),
    ).toBeInTheDocument();
  });

  it("drops an active search when the collection shrinks below the filters threshold", async () => {
    const user = setupUserWithFakeTimers();
    const { store } = setup();

    await user.type(
      await screen.findByPlaceholderText("Search by name or editor..."),
      "revenue",
    );
    advanceSearchDebounce();
    await waitFor(() => {
      expect(getSearchCalls()).toHaveLength(1);
    });
    expect(await screen.findByText("Revenue overview")).toBeInTheDocument();

    fetchMock.modifyRoute(`collection-${collection.id}-items`, {
      response: {
        data: collectionItems.slice(0, 3),
        total: 3,
        models: [],
        limit: 25,
        offset: 0,
      },
    });
    fetchMock.modifyRoute(`collection-${collection.id}-items-metadata`, {
      response: {
        available_models: ["dashboard", "card", "dataset"],
        total_items: 3,
      },
    });
    act(() => {
      store.dispatch(
        Api.util.invalidateTags([
          { type: "collection", id: `${collection.id}-items` },
        ]),
      );
    });

    await waitFor(() => {
      expect(
        screen.queryByTestId("collection-items-toolbar"),
      ).not.toBeInTheDocument();
    });
    await waitFor(() => {
      const itemsCalls = getItemsCalls();
      const lastItemsCall = new URL(itemsCalls[itemsCalls.length - 1].url);
      expect(lastItemsCall.searchParams.has("q")).toBe(false);
    });
  });

  it("keeps the table mounted without showing a loader during a refetch with no search", async () => {
    const { store } = setup();

    expect(await screen.findByText("Revenue overview")).toBeInTheDocument();
    let resolveRequest: (() => void) | undefined;
    const requestGate = new Promise<void>((resolve) => {
      resolveRequest = resolve;
    });
    fetchMock.modifyRoute(`collection-${collection.id}-items`, {
      response: async () => {
        await requestGate;
        return {
          data: collectionItems,
          total: collectionItems.length,
          models: [],
          limit: 25,
          offset: 0,
        };
      },
    });

    act(() => {
      store.dispatch(
        Api.util.invalidateTags([
          { type: "collection", id: `${collection.id}-items` },
        ]),
      );
    });
    await waitFor(() => {
      expect(getItemsCalls()).toHaveLength(2);
    });

    const tableWasMounted = screen.queryByTestId("collection-table") != null;
    const cachedItemWasVisible = screen.queryByText("Revenue overview") != null;
    const loadingWasVisible =
      within(screen.getByTestId("collection-items-toolbar")).queryByTestId(
        "loading-indicator",
      ) != null;
    await act(async () => {
      resolveRequest?.();
      await fetchMock.callHistory.flush();
    });

    expect(await screen.findByText("Revenue overview")).toBeInTheDocument();
    expect(tableWasMounted).toBe(true);
    expect(cachedItemWasVisible).toBe(true);
    expect(loadingWasVisible).toBe(false);
  });

  it("does not show the empty state while refetching an empty collection", async () => {
    const { store } = setup({ collectionItems: [], showFilterBar: false });

    expect(
      await screen.findByTestId("collection-empty-state"),
    ).toBeInTheDocument();
    let resolveRequest: (() => void) | undefined;
    const requestGate = new Promise<void>((resolve) => {
      resolveRequest = resolve;
    });
    fetchMock.modifyRoute(`collection-${collection.id}-items`, {
      response: async () => {
        await requestGate;
        return {
          data: [],
          total: 0,
          models: [],
          limit: 25,
          offset: 0,
        };
      },
    });

    act(() => {
      store.dispatch(
        Api.util.invalidateTags([
          { type: "collection", id: `${collection.id}-items` },
        ]),
      );
    });
    await waitFor(() => {
      expect(getItemsCalls()).toHaveLength(2);
    });

    const tableWasMounted = screen.queryByTestId("collection-table") != null;
    const emptyStateWasVisible =
      screen.queryByTestId("collection-empty-state") != null;
    await act(async () => {
      resolveRequest?.();
      await fetchMock.callHistory.flush();
    });

    expect(
      await screen.findByTestId("collection-empty-state"),
    ).toBeInTheDocument();
    expect(tableWasMounted).toBe(true);
    expect(emptyStateWasVisible).toBe(false);
  });

  it("sends search text and shows only matching items", async () => {
    const user = setupUserWithFakeTimers();
    setup();

    await user.type(
      await screen.findByPlaceholderText("Search by name or editor..."),
      "revenue",
    );

    expect(getSearchCalls()).toHaveLength(0);
    advanceSearchDebounce();
    await waitFor(() => {
      expect(getSearchCalls()).toHaveLength(1);
    });
    expect(await screen.findByText("Revenue overview")).toBeInTheDocument();
    expect(screen.queryByText("Customer 360")).not.toBeInTheDocument();
    expect(screen.queryByText("Orders model")).not.toBeInTheDocument();
    expect(new URL(getSearchCalls()[0].url).searchParams.get("q")).toBe(
      "revenue",
    );
  });

  it("debounces search requests", async () => {
    const user = setupUserWithFakeTimers();
    setup();

    await user.type(
      await screen.findByPlaceholderText("Search by name or editor..."),
      "rev",
    );

    expect(getSearchCalls()).toHaveLength(0);
    advanceSearchDebounce(SEARCH_DEBOUNCE_DURATION - 1);
    expect(getSearchCalls()).toHaveLength(0);

    advanceSearchDebounce(1);
    await waitFor(() => {
      expect(getSearchCalls()).toHaveLength(1);
    });
    expect(new URL(getSearchCalls()[0].url).searchParams.get("q")).toBe("rev");
  });

  it("tracks each search engagement once", async () => {
    const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
    const user = setupUserWithFakeTimers();
    setup();
    const searchInput = await screen.findByPlaceholderText(
      "Search by name or editor...",
    );

    await user.type(searchInput, "revenue");
    advanceSearchDebounce();
    await waitFor(() => {
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "collection_items_filtered",
        event_detail: "search",
        target_id: collection.id,
      });
    });

    await user.type(searchInput, " overview");
    advanceSearchDebounce();
    await waitFor(() => {
      expect(getSearchCalls()).toHaveLength(2);
    });
    expect(trackSimpleEvent).toHaveBeenCalledTimes(1);

    await user.click(
      await screen.findByRole("button", { name: "Clear search" }),
    );
    await user.type(searchInput, "customer");
    advanceSearchDebounce();
    await waitFor(() => {
      expect(trackSimpleEvent).toHaveBeenCalledTimes(2);
    });
    expect(trackSimpleEvent).toHaveBeenLastCalledWith({
      event: "collection_items_filtered",
      event_detail: "search",
      target_id: collection.id,
    });
  });

  it("clears the search and restores the unfiltered list", async () => {
    const user = setupUserWithFakeTimers();
    setup();
    const searchInput = await screen.findByPlaceholderText(
      "Search by name or editor...",
    );

    expect(
      screen.queryByRole("button", { name: "Clear search" }),
    ).not.toBeInTheDocument();
    await user.type(searchInput, "customer");
    advanceSearchDebounce();
    expect(
      await screen.findByRole("button", { name: "Clear search" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Customer 360")).toBeInTheDocument();
    expect(screen.queryByText("Revenue overview")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear search" }));

    expect(searchInput).toHaveValue("");
    expect(await screen.findByText("Revenue overview")).toBeInTheDocument();
    expect(screen.getByText("Customer 360")).toBeInTheDocument();
    expect(screen.getByText("Orders model")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Clear search" }),
    ).not.toBeInTheDocument();
  });

  it("resets pagination when searching", async () => {
    const user = setupUserWithFakeTimers();
    setup({ pageSize: 1 });

    expect(await screen.findByText("Revenue overview")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("Customer 360")).toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText("Search by name or editor..."),
      "orders",
    );

    advanceSearchDebounce();
    await waitFor(() => {
      expect(getSearchCalls()).toHaveLength(1);
    });
    const searchParams = new URL(getSearchCalls()[0].url).searchParams;
    expect(searchParams.get("q")).toBe("orders");
    expect(searchParams.get("offset")).toBe("0");
    expect(await screen.findByText("Orders model")).toBeInTheDocument();
  });

  it("shows a loader in the search input while keeping the table mounted during a search request", async () => {
    const user = setupUserWithFakeTimers();
    setup();
    const searchInput = await screen.findByPlaceholderText(
      "Search by name or editor...",
    );
    expect(await screen.findByText("Revenue overview")).toBeInTheDocument();
    let resolveRequest: (() => void) | undefined;
    const requestGate = new Promise<void>((resolve) => {
      resolveRequest = resolve;
    });
    fetchMock.modifyRoute(`collection-${collection.id}-items`, {
      response: async () => {
        await requestGate;
        return {
          data: [collectionItems[1]],
          total: 1,
          models: [],
          limit: 25,
          offset: 0,
        };
      },
    });

    await user.type(searchInput, "customer");
    advanceSearchDebounce();
    await waitFor(() => {
      expect(getSearchCalls()).toHaveLength(1);
    });

    const toolbar = screen.getByTestId("collection-items-toolbar");
    const loaderWasVisible =
      within(toolbar).queryByTestId("loading-indicator") != null;
    const clearButtonWasVisible =
      within(toolbar).queryByRole("button", { name: "Clear search" }) != null;
    const tableWasMounted = screen.queryByTestId("collection-table") != null;
    const cachedItemWasVisible = screen.queryByText("Revenue overview") != null;

    await act(async () => {
      resolveRequest?.();
      await fetchMock.callHistory.flush();
    });

    expect(loaderWasVisible).toBe(true);
    expect(clearButtonWasVisible).toBe(false);
    expect(tableWasMounted).toBe(true);
    expect(cachedItemWasVisible).toBe(true);
    expect(searchInput).toHaveValue("customer");
    expect(await screen.findByText("Customer 360")).toBeInTheDocument();
    expect(
      within(toolbar).queryByTestId("loading-indicator"),
    ).not.toBeInTheDocument();
    expect(
      within(toolbar).getByRole("button", { name: "Clear search" }),
    ).toBeInTheDocument();
  });

  it("does not show the filtered empty state while a search request is in flight", async () => {
    const user = setupUserWithFakeTimers();
    setup();

    await user.type(
      await screen.findByPlaceholderText("Search by name or editor..."),
      "not found",
    );
    advanceSearchDebounce();

    expect(
      within(screen.getByTestId("collection-items-toolbar")).getByTestId(
        "loading-indicator",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("collection-filter-empty-state"),
    ).not.toBeInTheDocument();

    expect(await screen.findByText("Didn't find anything")).toBeInTheDocument();
  });

  it("shows a filtered empty state when search has no matches", async () => {
    const user = setupUserWithFakeTimers();
    setup();

    await user.type(
      await screen.findByPlaceholderText("Search by name or editor..."),
      "not found",
    );
    advanceSearchDebounce();

    expect(await screen.findByText("Didn't find anything")).toBeInTheDocument();
    expect(
      screen.getByTestId("collection-filter-empty-state"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("collection-table")).not.toBeInTheDocument();
  });

  it("does not show the collection empty state while clearing a search", async () => {
    const user = setupUserWithFakeTimers();
    setup();

    await user.type(
      await screen.findByPlaceholderText("Search by name or editor..."),
      "not found",
    );
    advanceSearchDebounce();
    expect(
      await screen.findByTestId("collection-filter-empty-state"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear search" }));

    expect(screen.getByTestId("collection-items-toolbar")).toBeInTheDocument();
    expect(
      screen.queryByTestId("collection-empty-state"),
    ).not.toBeInTheDocument();
    expect(await screen.findByText("Revenue overview")).toBeInTheDocument();
  });

  it("shows filter options for the available item types", async () => {
    setup();

    await waitFor(() => {
      expect(getMetadataCalls()).toHaveLength(1);
    });
    await userEvent.click(
      await screen.findByTestId("collection-type-filter-button"),
    );
    const popover = screen.getByTestId("collection-type-filter-popover");

    expect(within(popover).getAllByRole("checkbox")).toHaveLength(8);
    for (const label of ["Dashboard", "Model", "Question"]) {
      expect(within(popover).getByLabelText(label)).not.toBeChecked();
      expect(within(popover).getByLabelText(label)).toBeEnabled();
    }
    expect(within(popover).getByLabelText("Metric")).toBeDisabled();
    expect(within(popover).getByLabelText("Document")).toBeDisabled();
  });

  it("offers a type filter for a type that only exists as a pinned item", async () => {
    setup({
      collectionItems: [
        collectionItems[1],
        createMockCollectionItem({
          id: 5,
          collection_id: collection.id,
          model: "dashboard",
          name: "Pinned revenue overview",
          collection_position: 1,
        }),
        ...createFillerItems(10),
      ],
    });

    await userEvent.click(
      await screen.findByTestId("collection-type-filter-button"),
    );
    const popover = screen.getByTestId("collection-type-filter-popover");

    expect(within(popover).getByLabelText("Dashboard")).toBeEnabled();
    expect(within(popover).getByLabelText("Dashboard")).not.toBeChecked();
    expect(within(popover).getByLabelText("Question")).toBeEnabled();
    expect(within(popover).getByLabelText("Model")).toBeDisabled();
  });

  it("refreshes the available type options when collection content changes", async () => {
    const { store } = setup();

    await waitFor(() => {
      expect(getMetadataCalls()).toHaveLength(1);
    });

    act(() => {
      store.dispatch(
        Api.util.invalidateTags([{ type: "dashboard", id: "LIST" }]),
      );
    });

    await waitFor(() => {
      expect(getMetadataCalls()).toHaveLength(2);
    });
  });

  it("fetches the available type options once, out of scope of search, type filters and pagination", async () => {
    const user = setupUserWithFakeTimers();
    setup({ pageSize: 1 });

    await waitFor(() => {
      expect(getMetadataCalls()).toHaveLength(1);
    });
    const metadataParams = new URL(getMetadataCalls()[0].url).searchParams;
    // The list's full model set, never the user's type selection.
    expect(metadataParams.getAll("models")).toEqual(ALL_MODELS);
    expect(metadataParams.has("q")).toBe(false);

    await user.click(
      await screen.findByTestId("collection-type-filter-button"),
    );
    await user.click(screen.getByLabelText("Model"));
    await user.click(screen.getByLabelText("Question"));
    await waitFor(() => {
      expect(findItemsSearchParamsByModels(["dataset", "card"])).toBeDefined();
    });
    screen.getByLabelText("Question").focus();
    await user.keyboard("{Escape}");

    await user.type(
      screen.getByPlaceholderText("Search by name or editor..."),
      "orders",
    );
    advanceSearchDebounce();
    await waitFor(() => {
      expect(getSearchCalls()).toHaveLength(1);
    });

    expect(getMetadataCalls()).toHaveLength(1);
    await user.click(screen.getByTestId("collection-type-filter-button"));
    const popover = screen.getByTestId("collection-type-filter-popover");
    expect(within(popover).getAllByRole("checkbox")).toHaveLength(8);
    expect(within(popover).getByLabelText("Dashboard")).not.toBeChecked();
    expect(within(popover).getByLabelText("Model")).toBeChecked();
    expect(within(popover).getByLabelText("Question")).toBeChecked();
  });

  it("filters by type and resets pagination", async () => {
    setup({ pageSize: 1 });

    expect(await screen.findByText("Revenue overview")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("Customer 360")).toBeInTheDocument();
    await userEvent.click(
      await screen.findByTestId("collection-type-filter-button"),
    );
    await userEvent.click(screen.getByLabelText("Question"));

    await waitFor(() => {
      expect(findItemsSearchParamsByModels(["card"])?.get("offset")).toBe("0");
    });
    expect(screen.queryByText("Revenue overview")).not.toBeInTheDocument();
    expect(screen.getByText("Customer 360")).toBeInTheDocument();
    expect(screen.queryByText("Orders model")).not.toBeInTheDocument();
  });

  it("tracks each type-filter engagement once", async () => {
    const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
    setup();

    await userEvent.click(
      await screen.findByTestId("collection-type-filter-button"),
    );
    await userEvent.click(screen.getByLabelText("Dashboard"));

    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "collection_items_filtered",
      event_detail: "type",
      target_id: collection.id,
    });

    await userEvent.click(screen.getByLabelText("Model"));
    expect(trackSimpleEvent).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByLabelText("Dashboard"));
    await userEvent.click(screen.getByLabelText("Model"));
    await userEvent.click(screen.getByLabelText("Dashboard"));

    expect(trackSimpleEvent).toHaveBeenCalledTimes(2);
    expect(trackSimpleEvent).toHaveBeenLastCalledWith({
      event: "collection_items_filtered",
      event_detail: "type",
      target_id: collection.id,
    });
  });

  it("restores the unfiltered list when every type is unchecked", async () => {
    setup();

    await userEvent.click(
      await screen.findByTestId("collection-type-filter-button"),
    );
    const popover = screen.getByTestId("collection-type-filter-popover");
    await userEvent.click(within(popover).getByLabelText("Dashboard"));

    await waitFor(() => {
      expect(findItemsSearchParamsByModels(["dashboard"])).toBeDefined();
    });
    expect(await screen.findByText("Revenue overview")).toBeInTheDocument();
    expect(screen.queryByText("Customer 360")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Filter, filters applied" }),
    ).toBeInTheDocument();

    await userEvent.click(within(popover).getByLabelText("Dashboard"));

    expect(await screen.findByText("Customer 360")).toBeInTheDocument();
    expect(screen.getByText("Revenue overview")).toBeInTheDocument();
    expect(screen.getByText("Orders model")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filter" })).toBeInTheDocument();
    expect(findItemsSearchParamsByModels(["no_models"])).toBeUndefined();
  });

  it("keeps all type options while search has no results", async () => {
    const user = setupUserWithFakeTimers();
    setup();

    await user.click(
      await screen.findByTestId("collection-type-filter-button"),
    );
    let popover = screen.getByTestId("collection-type-filter-popover");
    expect(within(popover).getAllByRole("checkbox")).toHaveLength(8);
    within(popover).getByLabelText("Dashboard").focus();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(
        screen.queryByTestId("collection-type-filter-popover"),
      ).not.toBeInTheDocument();
    });

    await user.type(
      await screen.findByPlaceholderText("Search by name or editor..."),
      "not found",
    );
    advanceSearchDebounce();
    expect(
      await screen.findByTestId("collection-filter-empty-state"),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId("collection-type-filter-button"));
    popover = screen.getByTestId("collection-type-filter-popover");
    expect(within(popover).getAllByRole("checkbox")).toHaveLength(8);
    expect(within(popover).getByLabelText("Dashboard")).toBeEnabled();
    expect(within(popover).getByLabelText("Model")).toBeEnabled();
    expect(within(popover).getByLabelText("Question")).toBeEnabled();
  });

  it("resets search and type filters before requesting a new collection", async () => {
    const nextCollection = createMockCollection({ id: 2, can_write: false });
    const nextCollectionItems = [
      createMockCollectionItem({
        id: 4,
        collection_id: nextCollection.id,
        model: "dashboard",
        name: "Inventory overview",
      }),
      ...createFillerItems(10, {
        collection_id: nextCollection.id,
        model: "dashboard",
      }),
    ];
    setupCollectionItemsEndpoint({ collection, collectionItems });
    const user = setupUserWithFakeTimers();
    renderWithProviders(
      <CollectionNavigationTest nextCollection={nextCollection} />,
      { withRouter: true, withDND: true },
    );

    await user.click(
      await screen.findByTestId("collection-type-filter-button"),
    );
    await user.click(screen.getByLabelText("Dashboard"));
    expect(
      screen.getByRole("button", { name: "Filter, filters applied" }),
    ).toBeInTheDocument();
    screen.getByLabelText("Dashboard").focus();
    await user.keyboard("{Escape}");

    await user.type(
      await screen.findByPlaceholderText("Search by name or editor..."),
      "revenue",
    );
    advanceSearchDebounce();
    await waitFor(() => {
      expect(getSearchCalls()).toHaveLength(1);
    });

    setupCollectionItemsEndpoint({
      collection: nextCollection,
      collectionItems: nextCollectionItems,
    });
    await user.click(
      screen.getByRole("button", { name: "Open next collection" }),
    );

    expect(await screen.findByText("Inventory overview")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Search by name or editor..."),
    ).toHaveValue("");
    expect(getItemsCalls(nextCollection.id).length).toBeGreaterThan(0);
    expect(getSearchCalls(nextCollection.id)).toHaveLength(0);
    expect(
      getItemsCalls(nextCollection.id).every((call) =>
        new URL(call.url).searchParams.getAll("models").includes("dashboard"),
      ),
    ).toBe(true);

    expect(screen.getByRole("button", { name: "Filter" })).toBeInTheDocument();
    await user.click(screen.getByTestId("collection-type-filter-button"));
    const popover = screen.getByTestId("collection-type-filter-popover");
    expect(within(popover).getByLabelText("Dashboard")).not.toBeChecked();
    expect(within(popover).getByLabelText("Dashboard")).toBeEnabled();
    expect(within(popover).getByLabelText("Question")).toBeDisabled();

    advanceSearchDebounce();
    expect(getSearchCalls(nextCollection.id)).toHaveLength(0);
  });

  it("does not show the previous collection's toolbar while a smaller collection loads", async () => {
    const nextCollection = createMockCollection({ id: 2, can_write: false });
    setupCollectionItemsEndpoint({ collection, collectionItems });
    setupCollectionItemsEndpoint({
      collection: nextCollection,
      collectionItems: createFillerItems(3, {
        collection_id: nextCollection.id,
      }),
    });
    let resolveMetadata: (() => void) | undefined;
    const metadataGate = new Promise<void>((resolve) => {
      resolveMetadata = resolve;
    });
    fetchMock.modifyRoute(`collection-${nextCollection.id}-items-metadata`, {
      response: async () => {
        await metadataGate;
        return { available_models: ["card"], total_items: 3 };
      },
    });
    renderWithProviders(
      <CollectionNavigationTest nextCollection={nextCollection} />,
      { withRouter: true, withDND: true },
    );
    expect(
      await screen.findByTestId("collection-items-toolbar"),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Open next collection" }),
    );

    expect(await screen.findByText("Extra card 1")).toBeInTheDocument();
    expect(
      screen.queryByTestId("collection-items-toolbar"),
    ).not.toBeInTheDocument();
    await act(async () => {
      resolveMetadata?.();
      await fetchMock.callHistory.flush();
    });
    expect(
      screen.queryByTestId("collection-items-toolbar"),
    ).not.toBeInTheDocument();
  });

  it("shows the existing empty state without a toolbar for a truly empty collection", async () => {
    setup({ collectionItems: [] });

    expect(
      await screen.findByTestId("collection-empty-state"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("collection-items-toolbar"),
    ).not.toBeInTheDocument();
  });

  it("keeps official collections in the generic Collection filter", async () => {
    const regularCollection = createMockCollectionItem({
      id: 4,
      collection_id: collection.id,
      model: "collection",
      name: "Regular collection",
      authority_level: null,
    });
    const officialCollection = createMockCollectionItem({
      id: 5,
      collection_id: collection.id,
      model: "collection",
      name: "Official collection",
      authority_level: "official",
    });
    setup({
      collectionItems: [
        collectionItems[0],
        regularCollection,
        officialCollection,
        ...createFillerItems(9, { model: "collection" }),
      ],
    });

    expect(await screen.findByText("Revenue overview")).toBeInTheDocument();
    expect(screen.getByText("Regular collection")).toBeInTheDocument();
    expect(screen.getByText("Official collection")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("collection-type-filter-button"));
    await userEvent.click(screen.getByLabelText("Collection"));

    await waitFor(() => {
      const searchParams = findItemsSearchParamsByModels(["collection"]);
      expect(searchParams).toBeDefined();
      expect(searchParams?.has("authority_level")).toBe(false);
    });
    expect(screen.getByText("Regular collection")).toBeInTheDocument();
    expect(screen.getByText("Official collection")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("Revenue overview")).not.toBeInTheDocument();
    });
  });
});
