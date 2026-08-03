import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupCollectionItemsEndpoint } from "__support__/server-mocks";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { Route } from "metabase/router";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import type { CollectionItem } from "metabase-types/api";
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

const ITEMS_PATH = `path:/api/collection/${collection.id}/items`;

type SetupOpts = {
  collectionItems?: CollectionItem[];
  pageSize?: number;
  showFilterBar?: boolean;
};

function setup({
  collectionItems: items = collectionItems,
  pageSize,
  showFilterBar = true,
}: SetupOpts = {}) {
  setupCollectionItemsEndpoint({ collection, collectionItems: items });

  renderWithProviders(
    <Route
      path="/"
      element={
        <CollectionItemsTable
          collection={collection}
          collectionId={collection.id}
          pageSize={pageSize}
          {...(showFilterBar ? { showFilterBar: true } : {})}
        />
      }
    />,
    { withRouter: true, withDND: true },
  );
}

function getItemsCalls() {
  return fetchMock.callHistory.calls(ITEMS_PATH);
}

function getSearchCalls() {
  return getItemsCalls().filter((call) =>
    new URL(call.url).searchParams.has("q"),
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
    setup();

    await userEvent.type(
      await screen.findByPlaceholderText("Search by name or editor..."),
      "revenue",
    );

    await waitFor(
      () => {
        expect(getSearchCalls()).toHaveLength(1);
      },
      { timeout: 3000 },
    );
    expect(await screen.findByText("Revenue overview")).toBeInTheDocument();
    expect(screen.queryByText("Customer 360")).not.toBeInTheDocument();
    expect(screen.queryByText("Orders model")).not.toBeInTheDocument();
    expect(new URL(getSearchCalls()[0].url).searchParams.get("q")).toBe(
      "revenue",
    );
  });

  it("debounces search requests", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    setup();

    await user.type(
      await screen.findByPlaceholderText("Search by name or editor..."),
      "rev",
    );

    expect(getSearchCalls()).toHaveLength(0);
    act(() => {
      jest.advanceTimersByTime(SEARCH_DEBOUNCE_DURATION - 1);
    });
    expect(getSearchCalls()).toHaveLength(0);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    await waitFor(() => {
      expect(getSearchCalls()).toHaveLength(1);
    });
    expect(new URL(getSearchCalls()[0].url).searchParams.get("q")).toBe("rev");
  });

  it("clears the search and restores the unfiltered list", async () => {
    setup();
    const searchInput = await screen.findByPlaceholderText(
      "Search by name or editor...",
    );

    expect(
      screen.queryByRole("button", { name: /clear/i }),
    ).not.toBeInTheDocument();
    await userEvent.type(searchInput, "customer");
    expect(
      await screen.findByRole("button", { name: /clear/i }, { timeout: 3000 }),
    ).toBeInTheDocument();
    await waitFor(
      () => {
        expect(screen.queryByText("Revenue overview")).not.toBeInTheDocument();
      },
      { timeout: 3000 },
    );
    expect(screen.getByText("Customer 360")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /clear/i }));

    expect(searchInput).toHaveValue("");
    expect(await screen.findByText("Revenue overview")).toBeInTheDocument();
    expect(screen.getByText("Customer 360")).toBeInTheDocument();
    expect(screen.getByText("Orders model")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /clear/i }),
    ).not.toBeInTheDocument();
  });

  it("resets pagination when searching", async () => {
    setup({ pageSize: 1 });

    expect(await screen.findByText("Revenue overview")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("Customer 360")).toBeInTheDocument();

    await userEvent.type(
      screen.getByPlaceholderText("Search by name or editor..."),
      "orders",
    );

    await waitFor(
      () => {
        expect(getSearchCalls()).toHaveLength(1);
      },
      { timeout: 3000 },
    );
    const searchParams = new URL(getSearchCalls()[0].url).searchParams;
    expect(searchParams.get("q")).toBe("orders");
    expect(searchParams.get("offset")).toBe("0");
    expect(await screen.findByText("Orders model")).toBeInTheDocument();
  });

  it("shows a filtered empty state when search has no matches", async () => {
    setup();

    await userEvent.type(
      await screen.findByPlaceholderText("Search by name or editor..."),
      "not found",
    );

    expect(
      await screen.findByText("Didn't find anything", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("collection-filter-empty-state"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("collection-table")).not.toBeInTheDocument();
  });

  it("does not show the collection empty state while clearing a search", async () => {
    setup();

    await userEvent.type(
      await screen.findByPlaceholderText("Search by name or editor..."),
      "not found",
    );
    expect(
      await screen.findByTestId(
        "collection-filter-empty-state",
        {},
        {
          timeout: 3000,
        },
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(screen.getByTestId("collection-items-toolbar")).toBeInTheDocument();
    expect(
      screen.queryByTestId("collection-empty-state"),
    ).not.toBeInTheDocument();
    expect(await screen.findByText("Revenue overview")).toBeInTheDocument();
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
