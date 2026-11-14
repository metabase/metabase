import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupDashboardQuestionCandidatesEndpoint,
  setupUpdateSettingEndpoint,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  getIcon,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import * as Analytics from "metabase/analytics";
import { CollectionMenu } from "metabase/collections/components/CollectionMenu";
import { dayjs } from "metabase/dayjs";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { Outlet, Route } from "metabase/router";
import type { Collection, CollectionId } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import type { StaleCollectionItem } from "../types";

// The cleanup undo toast has no `ref`, so the real `Transition` calls
// `findDOMNode`, which React 19 removed, and the modal crashes. The e2e test
// never saw this because `UndoListing` swaps in a pass-through `Transition`
// under Cypress. Do the same here until the toast passes a `ref`.
jest.mock("react-transition-group", () => {
  const actual = jest.requireActual<Record<string, unknown>>(
    "react-transition-group",
  );
  return {
    ...actual,
    Transition: ({
      children,
    }: {
      children: (state: "entered") => React.ReactNode;
    }) => children("entered"),
  };
});

const PARENT_COLLECTION = createMockCollection({
  id: 10,
  name: "Clean up test",
  can_write: true,
});
const CHILD_COLLECTION = createMockCollection({
  id: 11,
  name: "Child clean up test",
  can_write: true,
  location: "/10/",
});
const ROOT_COLLECTION = createMockCollection({
  id: "root",
  name: "Our analytics",
  can_write: true,
});

const TODAY = dayjs().startOf("day");
const VERY_STALE_DATE = "2000-01-01";
// `/api/testing/mark-stale` backdates items by 7 months when no date is given
const STALE_DATE = TODAY.subtract(7, "months").format("YYYY-MM-DD");
const NOT_STALE_DATE = TODAY.format("YYYY-MM-DD");

type FakeItem = StaleCollectionItem & { parentId: CollectionId };

const fakeItem = ({
  id,
  model,
  name,
  lastUsedAt,
  collection,
}: {
  id: number;
  model: "dataset" | "dashboard" | "card";
  name: string;
  lastUsedAt: string;
  collection: Collection;
}): FakeItem => ({
  ...createMockCollectionItem({
    id,
    model,
    name,
    archived: false,
    collection: createMockCollection({
      id: collection.id,
      name: collection.name,
    }),
    collection_id: typeof collection.id === "number" ? collection.id : null,
  }),
  last_used_at: lastUsedAt,
  parentId: collection.id,
});

// Same seed as the e2e test this replaces: 12 models (4 very stale, 4 stale, 4
// recently used) and 9 dashboards (3/3/3) in the collection, and 5 very stale
// dashboards in a child collection.
const createMainSeed = (): FakeItem[] => {
  const questions = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n, index) =>
    fakeItem({
      id: 100 + n,
      model: "dataset",
      name: `Bulk question ${n}`,
      lastUsedAt:
        index < 4 ? VERY_STALE_DATE : index < 8 ? STALE_DATE : NOT_STALE_DATE,
      collection: PARENT_COLLECTION,
    }),
  );
  const dashboards = [9, 8, 7, 6, 5, 4, 3, 2, 1].map((n, index) =>
    fakeItem({
      id: 200 + n,
      model: "dashboard",
      name: `Bulk dashboard ${n}`,
      lastUsedAt:
        index < 3 ? VERY_STALE_DATE : index < 6 ? STALE_DATE : NOT_STALE_DATE,
      collection: PARENT_COLLECTION,
    }),
  );
  const childDashboards = [5, 4, 3, 2, 1].map((n) =>
    fakeItem({
      id: 300 + n,
      model: "dashboard",
      name: `Bulk dashboard ${n}`,
      lastUsedAt: VERY_STALE_DATE,
      collection: CHILD_COLLECTION,
    }),
  );
  return [...questions, ...dashboards, ...childDashboards];
};

const TOTAL_STALE_ITEM_COUNT = 14;
const RECURSIVE_STALE_ITEM_COUNT = 19;

const compareItems = (
  a: FakeItem,
  b: FakeItem,
  column: string,
  direction: string,
) => {
  const order =
    column === "last_used_at"
      ? a.last_used_at.localeCompare(b.last_used_at)
      : a.name.localeCompare(b.name);
  return direction === "desc" ? -order : order;
};

/**
 * A fake `/api/ee/stale/:id` backend. It filters, sorts and paginates the
 * items like the real endpoint, so a request with a wrong id, date, recursive
 * flag, sort or page returns different rows. Archive requests change the
 * stored items inside their own handlers.
 */
const setupFakeStaleBackend = (items: FakeItem[]) => {
  fetchMock.get(
    "express:/api/ee/stale/:id",
    ({ url, expressParams }) => {
      const params = new URL(url).searchParams;
      const collectionId =
        expressParams?.id === "root" ? "root" : Number(expressParams?.id);
      const beforeDate = params.get("before_date") ?? "";
      const isRecursive = params.get("is_recursive") === "true";
      const limit = Number(params.get("limit") ?? 50);
      const offset = Number(params.get("offset") ?? 0);
      const sortColumn = params.get("sort_column") ?? "name";
      const sortDirection = params.get("sort_direction") ?? "asc";

      const matching = items
        .filter((item) => !item.archived)
        .filter(
          (item) =>
            item.parentId === collectionId ||
            (isRecursive &&
              collectionId === PARENT_COLLECTION.id &&
              item.parentId === CHILD_COLLECTION.id),
        )
        .filter((item) => item.last_used_at < beforeDate)
        .sort((a, b) => compareItems(a, b, sortColumn, sortDirection));

      return {
        data: matching
          .slice(offset, offset + limit)
          .map(({ parentId: _parentId, ...item }) => item),
        total: matching.length,
        limit,
        offset,
      };
    },
    { name: "stale-items" },
  );

  const archiveHandler =
    (models: string[]) =>
    ({
      expressParams,
      options,
    }: {
      expressParams?: Record<string, string>;
      options: RequestInit;
    }) => {
      const id = Number(expressParams?.id);
      const item = items.find(
        (item) => item.id === id && models.includes(item.model),
      );
      if (!item) {
        return 404;
      }
      const body: unknown = JSON.parse(String(options.body));
      const archived =
        typeof body === "object" &&
        body !== null &&
        "archived" in body &&
        body.archived === true;
      item.archived = archived;
      return models.includes("dashboard")
        ? createMockDashboard({ id, archived })
        : createMockCard({ id, archived });
    };

  fetchMock.put("express:/api/card/:id", archiveHandler(["card", "dataset"]), {
    name: "archive-card",
  });
  fetchMock.put("express:/api/dashboard/:id", archiveHandler(["dashboard"]), {
    name: "archive-dashboard",
  });
};

interface SetupOpts {
  collection?: Collection;
  items?: FakeItem[];
}

const setup = ({
  collection = PARENT_COLLECTION,
  items = createMainSeed(),
}: SetupOpts = {}) => {
  const trackSchemaEvent = jest.spyOn(Analytics, "trackSchemaEvent");

  fetchMock.get(`path:/api/collection/${collection.id}/items`, {
    data: [],
    total: items.filter((item) => item.parentId === collection.id).length,
    limit: 0,
    offset: 0,
  });
  setupDashboardQuestionCandidatesEndpoint([]);
  setupUserKeyValueEndpoints({
    namespace: "indicator-menu",
    key: "collection-menu",
    value: [],
  });
  setupUserKeyValueEndpoints({
    namespace: "user_acknowledgement",
    key: "clean-stale-items",
    value: false,
  });
  setupUpdateSettingEndpoint();
  setupFakeStaleBackend(items);

  const state = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({ collection_cleanup: true }),
    }),
    currentUser: createMockUser({ is_superuser: true }),
  });
  setupEnterpriseOnlyPlugin("clean_up");

  const collectionPath =
    collection.id === "root"
      ? "/collection/root"
      : `/collection/${collection.id}-${collection.name.toLowerCase().replaceAll(" ", "-")}`;

  const { router } = renderWithProviders(
    <Route
      path="/collection/:slug"
      element={
        <>
          <CollectionMenu
            collection={collection}
            isAdmin
            onUpdateCollection={jest.fn()}
          />
          <Outlet />
        </>
      }
    >
      {PLUGIN_COLLECTIONS.cleanUpRoute}
    </Route>,
    {
      storeInitialState: state,
      withRouter: true,
      initialRoute: collectionPath,
    },
  );

  return {
    trackSchemaEvent,
    getPathname: () => router?.location.pathname,
    items,
  };
};

const getModal = () => screen.getByTestId("cleanup-collection-modal");
const getPagination = () =>
  screen.getByTestId("cleanup-collection-modal-pagination");

const openCleanUpModal = async () => {
  await userEvent.click(getIcon("ellipsis"));
  await userEvent.click(
    await screen.findByRole("menuitem", { name: /Clear out unused items/ }),
  );
  await screen.findByTestId("cleanup-collection-modal");
};

const assertStaleItemCount = async (count: number) => {
  await waitFor(() =>
    expect(
      within(getModal()).getByTestId("pagination-total"),
    ).toHaveTextContent(String(count)),
  );
};

const setDateFilter = async (label: string) => {
  await userEvent.click(screen.getByTestId("cleanup-date-filter"));
  await userEvent.click(await screen.findByRole("option", { name: label }));
};

const toggleRecursiveFilter = () =>
  userEvent.click(
    screen.getByRole("switch", { name: /Include items in sub-collections/ }),
  );

const selectAllItemsOnPage = async () => {
  for (const cell of within(getModal()).getAllByTestId(
    "clean-up-table-check",
  )) {
    await userEvent.click(within(cell).getByRole("checkbox"));
  }
};

const moveToTrash = async () => {
  await userEvent.click(
    within(await screen.findByTestId("toast-card")).getByText("Move to trash"),
  );
};

const lastStaleRequestParams = () => {
  const url = fetchMock.callHistory.lastCall("stale-items")?.url;
  return new URL(url ?? "http://localhost").searchParams;
};

describe("CleanupCollectionModal", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("opens from the collection menu and lists the stale items of the collection", async () => {
    const { getPathname } = setup();

    await openCleanUpModal();
    expect(getPathname()).toBe("/collection/10-clean-up-test/cleanup");
    await assertStaleItemCount(TOTAL_STALE_ITEM_COUNT);

    const params = lastStaleRequestParams();
    expect(fetchMock.callHistory.lastCall("stale-items")?.url).toContain(
      "/api/ee/stale/10?",
    );
    expect(params.get("before_date")).toBe(
      TODAY.subtract(3, "months").format("YYYY-MM-DD"),
    );
    expect(params.get("is_recursive")).toBe("false");
    expect(params.get("limit")).toBe("10");
    expect(params.get("offset")).toBe("0");
    expect(params.get("sort_column")).toBe("name");
    expect(params.get("sort_direction")).toBe("asc");
  });

  it("filters, paginates and sorts the stale items", async () => {
    setup();
    await openCleanUpModal();
    await assertStaleItemCount(TOTAL_STALE_ITEM_COUNT);

    // only the 7 very stale items are older than a year: one page
    await setDateFilter("1 year");
    expect(
      await within(getModal()).findByText("Bulk question 12"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByTestId("cleanup-collection-modal-pagination"),
      ).not.toBeInTheDocument(),
    );
    expect(
      within(getModal()).getAllByTestId("clean-up-table-check"),
    ).toHaveLength(7);
    expect(lastStaleRequestParams().get("before_date")).toBe(
      TODAY.subtract(1, "year").format("YYYY-MM-DD"),
    );

    await setDateFilter("6 months");
    await toggleRecursiveFilter();
    await assertStaleItemCount(RECURSIVE_STALE_ITEM_COUNT);
    expect(lastStaleRequestParams().get("is_recursive")).toBe("true");
    expect(lastStaleRequestParams().get("before_date")).toBe(
      TODAY.subtract(6, "months").format("YYYY-MM-DD"),
    );

    // pagination
    expect(within(getPagination()).getByText("1 - 10")).toBeInTheDocument();
    expect(
      within(getModal()).queryByText("Bulk question 9"),
    ).not.toBeInTheDocument();
    await userEvent.click(within(getPagination()).getByTestId("next-page-btn"));
    expect(
      await within(getPagination()).findByText("11 - 19"),
    ).toBeInTheDocument();
    expect(
      await within(getModal()).findByText("Bulk question 9"),
    ).toBeInTheDocument();
    expect(lastStaleRequestParams().get("offset")).toBe("10");
    await userEvent.click(
      within(getPagination()).getByTestId("previous-page-btn"),
    );
    expect(
      await within(getPagination()).findByText("1 - 10"),
    ).toBeInTheDocument();
    await userEvent.click(within(getPagination()).getByTestId("next-page-btn"));
    expect(
      await within(getPagination()).findByText("11 - 19"),
    ).toBeInTheDocument();

    // the date filter resets pagination
    await setDateFilter("3 months");
    expect(
      await within(getPagination()).findByText("1 - 10"),
    ).toBeInTheDocument();
    await userEvent.click(within(getPagination()).getByTestId("next-page-btn"));
    expect(
      await within(getPagination()).findByText("11 - 19"),
    ).toBeInTheDocument();

    // the recursive filter resets pagination
    await toggleRecursiveFilter();
    expect(
      await within(getPagination()).findByText("1 - 10"),
    ).toBeInTheDocument();
    await toggleRecursiveFilter();
    await assertStaleItemCount(RECURSIVE_STALE_ITEM_COUNT);

    // sorting by name
    const table = within(within(getModal()).getByRole("table"));
    expect(await table.findByText("Bulk dashboard 1")).toBeInTheDocument();
    expect(table.queryByText("Bulk question 9")).not.toBeInTheDocument();
    await userEvent.click(table.getByText(/Name/));
    expect(await table.findByText("Bulk question 9")).toBeInTheDocument();
    expect(table.queryByText("Bulk dashboard 1")).not.toBeInTheDocument();
    expect(lastStaleRequestParams().get("sort_direction")).toBe("desc");
    await userEvent.click(table.getByText(/Name/));
    expect(await table.findByText("Bulk dashboard 1")).toBeInTheDocument();
    expect(table.queryByText("Bulk question 9")).not.toBeInTheDocument();
    expect(lastStaleRequestParams().get("sort_direction")).toBe("asc");
  });

  it("moves the selected stale items to the trash, undoes it and closes", async () => {
    const { trackSchemaEvent, getPathname, items } = setup();
    await openCleanUpModal();
    await assertStaleItemCount(TOTAL_STALE_ITEM_COUNT);

    await selectAllItemsOnPage();
    await moveToTrash();
    await waitFor(() =>
      expect(
        screen.queryByTestId("cleanup-collection-modal-pagination"),
      ).not.toBeInTheDocument(),
    );
    expect(
      within(getModal()).getAllByTestId("clean-up-table-check"),
    ).toHaveLength(4);

    // the first page, sorted by name, holds the 6 stale dashboards and 4 models
    const firstPageNames = [
      "Bulk dashboard 4",
      "Bulk dashboard 5",
      "Bulk dashboard 6",
      "Bulk dashboard 7",
      "Bulk dashboard 8",
      "Bulk dashboard 9",
      "Bulk question 10",
      "Bulk question 11",
      "Bulk question 12",
      "Bulk question 5",
    ];
    expect(
      items
        .filter((item) => item.archived)
        .map((item) => item.name)
        .sort(),
    ).toEqual(firstPageNames);

    const movedToTrashEvents = trackSchemaEvent.mock.calls.filter(
      ([schema, event]) =>
        schema === "simple_event" && event.event === "moved-to-trash",
    );
    expect(movedToTrashEvents).toHaveLength(10);
    movedToTrashEvents.forEach(([, event]) =>
      expect(event).toEqual({
        event: "moved-to-trash",
        event_detail: expect.stringMatching(/^(dashboard|dataset)$/),
        target_id: expect.any(Number),
        triggered_from: "cleanup_modal",
        duration_ms: expect.any(Number),
        result: "success",
      }),
    );
    expect(trackSchemaEvent).toHaveBeenCalledWith("cleanup", {
      event: "stale_items_archived",
      collection_id: PARENT_COLLECTION.id,
      total_items_archived: 10,
      cutoff_date: new Date(
        TODAY.subtract(3, "months").format("YYYY-MM-DD"),
      ).toISOString(),
    });

    await userEvent.click(
      within(screen.getByTestId("toast-undo")).getByText("Undo"),
    );
    await assertStaleItemCount(TOTAL_STALE_ITEM_COUNT);
    expect(items.filter((item) => item.archived)).toHaveLength(0);

    await selectAllItemsOnPage();
    await moveToTrash();
    await waitFor(() =>
      expect(
        within(getModal()).getAllByTestId("clean-up-table-check"),
      ).toHaveLength(4),
    );
    expect(
      screen.queryByTestId("cleanup-collection-modal-pagination"),
    ).not.toBeInTheDocument();

    await selectAllItemsOnPage();
    await moveToTrash();
    expect(
      await within(getModal()).findByText(
        "All items have been used in the past 3 months",
      ),
    ).toBeInTheDocument();
    expect(
      items
        .filter((item) => item.parentId === PARENT_COLLECTION.id)
        .filter((item) => !item.archived)
        .map((item) => item.last_used_at),
    ).toEqual(Array(7).fill(NOT_STALE_DATE));

    await userEvent.click(
      screen.getByTestId("cleanup-collection-modal-close-btn"),
    );
    await waitFor(() =>
      expect(getPathname()).toBe("/collection/10-clean-up-test"),
    );
    expect(
      screen.queryByTestId("cleanup-collection-modal"),
    ).not.toBeInTheDocument();
  });

  it("reports stale items archived in the root collection with a null collection id", async () => {
    const { trackSchemaEvent, items } = setup({
      collection: ROOT_COLLECTION,
      items: [
        fakeItem({
          id: 1,
          model: "card",
          name: "Orders",
          lastUsedAt: STALE_DATE,
          collection: ROOT_COLLECTION,
        }),
        fakeItem({
          id: 2,
          model: "card",
          name: "Orders, Count",
          lastUsedAt: NOT_STALE_DATE,
          collection: ROOT_COLLECTION,
        }),
      ],
    });
    await openCleanUpModal();
    expect(fetchMock.callHistory.lastCall("stale-items")?.url).toContain(
      "/api/ee/stale/root?",
    );

    expect(await within(getModal()).findByText("Orders")).toBeInTheDocument();
    expect(
      within(getModal()).queryByText("Orders, Count"),
    ).not.toBeInTheDocument();
    await selectAllItemsOnPage();
    await moveToTrash();

    await waitFor(() =>
      expect(trackSchemaEvent).toHaveBeenCalledWith("cleanup", {
        event: "stale_items_archived",
        collection_id: null,
        total_items_archived: 1,
        cutoff_date: expect.any(String),
      }),
    );
    expect(items.find((item) => item.id === 1)?.archived).toBe(true);
    expect(items.find((item) => item.id === 2)?.archived).toBe(false);
  });

  it("shows an empty state when the collection has no stale items", async () => {
    setup({
      items: [
        fakeItem({
          id: 101,
          model: "dataset",
          name: "Recently used",
          lastUsedAt: NOT_STALE_DATE,
          collection: PARENT_COLLECTION,
        }),
      ],
    });
    await openCleanUpModal();

    expect(
      await within(getModal()).findByText(
        "All items have been used in the past 3 months",
      ),
    ).toBeInTheDocument();
    expect(
      within(getModal()).queryByText("Recently used"),
    ).not.toBeInTheDocument();
  });

  it("shows an error state when stale items fail to load", async () => {
    setup();
    await openCleanUpModal();
    await assertStaleItemCount(TOTAL_STALE_ITEM_COUNT);

    fetchMock.modifyRoute("stale-items", { response: 500 });
    await setDateFilter("1 year");

    expect(
      await within(getModal()).findByText(/An error occurred/),
    ).toBeInTheDocument();
  });
});
