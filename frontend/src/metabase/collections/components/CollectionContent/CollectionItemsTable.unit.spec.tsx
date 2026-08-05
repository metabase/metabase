import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { useState } from "react";

import { setupCollectionItemsEndpoint } from "__support__/server-mocks";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
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

const collection = createMockCollection({ id: 1, can_write: false });
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

function getSearchCalls(collectionId: CollectionId = collection.id) {
  return getItemsCalls(collectionId).filter((call) =>
    new URL(call.url).searchParams.has("q"),
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
  afterEach(() => {
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

  it("shows a loading state while a search request is in flight", async () => {
    const user = setupUserWithFakeTimers();
    setup();
    const searchInput = await screen.findByPlaceholderText(
      "Search by name or editor...",
    );
    expect(await screen.findByText("Revenue overview")).toBeInTheDocument();

    await user.type(searchInput, "customer");
    advanceSearchDebounce();

    expect(screen.getByTestId("collection-items-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("collection-table")).not.toBeInTheDocument();
    expect(screen.queryByText("Revenue overview")).not.toBeInTheDocument();
    expect(screen.getByTestId("collection-items-toolbar")).toBeInTheDocument();
    expect(searchInput).toHaveValue("customer");

    expect(await screen.findByText("Customer 360")).toBeInTheDocument();
    expect(
      screen.queryByTestId("collection-items-loading"),
    ).not.toBeInTheDocument();
  });

  it("does not show the filtered empty state while a search request is in flight", async () => {
    const user = setupUserWithFakeTimers();
    setup();

    await user.type(
      await screen.findByPlaceholderText("Search by name or editor..."),
      "not found",
    );
    advanceSearchDebounce();

    expect(screen.getByTestId("collection-items-loading")).toBeInTheDocument();
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

  it("does not send the previous search to a new collection", async () => {
    const nextCollection = createMockCollection({ id: 2, can_write: false });
    const nextCollectionItems = [
      createMockCollectionItem({
        id: 4,
        collection_id: nextCollection.id,
        model: "dashboard",
        name: "Inventory overview",
      }),
    ];
    setupCollectionItemsEndpoint({ collection, collectionItems });
    const user = setupUserWithFakeTimers();
    renderWithProviders(
      <CollectionNavigationTest nextCollection={nextCollection} />,
      { withRouter: true, withDND: true },
    );

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

    expect(
      screen.getByPlaceholderText("Search by name or editor..."),
    ).toHaveValue("");
    expect(await screen.findByText("Inventory overview")).toBeInTheDocument();
    expect(getItemsCalls(nextCollection.id).length).toBeGreaterThan(0);
    expect(getSearchCalls(nextCollection.id)).toHaveLength(0);

    advanceSearchDebounce();
    expect(getSearchCalls(nextCollection.id)).toHaveLength(0);
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
});
