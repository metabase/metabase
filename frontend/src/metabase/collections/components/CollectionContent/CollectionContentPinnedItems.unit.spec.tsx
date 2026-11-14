import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupBookmarksEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupNullGetUserKeyValueEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupRootCollectionItemsEndpoint,
  setupSearchEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import {
  act,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { Route, useParams } from "metabase/router";
import type { CollectionItem } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockDatabase,
} from "metabase-types/api/mocks";

import { CollectionContent } from "./CollectionContent";

const collection = createMockCollection({ id: 1, can_write: true });

const pinnedDashboard = createMockCollectionItem({
  id: 1,
  name: "Pinned dashboard",
  model: "dashboard",
  collection_position: 1,
});

const regularQuestion = createMockCollectionItem({
  id: 2,
  name: "Regular question",
  model: "card",
});

interface SetupOpts {
  collectionItems?: CollectionItem[];
}

function setup({
  collectionItems = [pinnedDashboard, regularQuestion],
}: SetupOpts = {}) {
  setupDatabasesEndpoints([createMockDatabase()]);
  setupBookmarksEndpoints([]);
  setupNullGetUserKeyValueEndpoints();
  setupSearchEndpoints([]);
  setupUserMetabotPermissionsEndpoint();
  setupCollectionsEndpoints({ collections: [collection] });
  setupCollectionByIdEndpoint({ collections: [collection] });
  setupCollectionItemsEndpoint({ collection, collectionItems });

  const { router } = renderWithProviders(
    <>
      <Route path="/" element={<CollectionContent collectionId={1} />} />
      <Route
        path="/question/:slug"
        element={<DestinationPage entity="Question" />}
      />
      <Route
        path="/dashboard/:slug"
        element={<DestinationPage entity="Dashboard" />}
      />
      <Route path="/model/:slug" element={<DestinationPage entity="Model" />} />
    </>,
    { withRouter: true, withDND: true },
  );
  if (!router) {
    throw new Error("withRouter renders a router");
  }
  return { router };
}

function DestinationPage({ entity }: { entity: string }) {
  const { slug } = useParams();
  return <h1>{`${entity} page ${slug}`}</h1>;
}

describe("CollectionContent pinned items", () => {
  it("shows pinned items in both the pinned section and the contents list", async () => {
    setup();

    const pinnedSection = within(await screen.findByTestId("pinned-items"));
    expect(
      await pinnedSection.findByText("Pinned dashboard"),
    ).toBeInTheDocument();

    const table = within(await screen.findByTestId("collection-table"));
    expect(await table.findByText("Pinned dashboard")).toBeInTheDocument();
    expect(table.getByText("Regular question")).toBeInTheDocument();
  });
});

const DASHBOARD_NAME = "Orders in a dashboard";
const QUESTION_NAME = "Orders, Count";
const MODEL_NAME = "Orders";

function createItems({
  dashboardPosition = null,
  questionPosition = null,
}: {
  dashboardPosition?: number | null;
  questionPosition?: number | null;
} = {}) {
  return [
    createMockCollectionItem({
      id: 10,
      name: "Another question",
      model: "card",
    }),
    createMockCollectionItem({
      id: 11,
      name: DASHBOARD_NAME,
      model: "dashboard",
      can_write: true,
      collection_id: collection.id,
      collection_position: dashboardPosition,
    }),
    createMockCollectionItem({
      id: 12,
      name: QUESTION_NAME,
      model: "card",
      display: "scalar",
      can_write: true,
      collection_id: collection.id,
      collection_position: questionPosition,
    }),
    createMockCollectionItem({
      id: 13,
      name: MODEL_NAME,
      model: "dataset",
      can_write: true,
      collection_id: collection.id,
    }),
  ];
}

type ItemUpdate = Partial<Pick<CollectionItem, "collection_position">> & {
  archived?: boolean;
};

function isItemUpdate(value: unknown): value is ItemUpdate {
  return typeof value === "object" && value != null;
}

// Stands in for PUT /api/card/:id and PUT /api/dashboard/:id: the stored item
// changes only when the request for that item arrives, so the UI can show the
// new state only after it refetches the collection items.
function setupItemUpdateEndpoint(
  items: CollectionItem[],
  { id, model }: Pick<CollectionItem, "id" | "model">,
) {
  const apiModel = model === "dashboard" ? "dashboard" : "card";
  fetchMock.put(`path:/api/${apiModel}/${id}`, (call) => {
    const body: unknown = JSON.parse(String(call.options.body));
    const index = items.findIndex(
      (item) => item.id === id && item.model === model,
    );
    if (!isItemUpdate(body) || index < 0) {
      return { status: 400 };
    }
    if (body.archived) {
      items.splice(index, 1);
    } else if ("collection_position" in body) {
      items[index] = {
        ...items[index],
        collection_position: body.collection_position,
      };
    }
    return { id };
  });
}

function getItem(items: CollectionItem[], name: string) {
  const item = items.find((item) => item.name === name);
  if (!item) {
    throw new Error(`No fixture item named ${name}`);
  }
  return item;
}

function getPutBodies(url: string) {
  return fetchMock.callHistory
    .calls(url, { method: "PUT" })
    .map((call): unknown => JSON.parse(String(call.options.body)));
}

function getPinnedSection() {
  return within(screen.getByTestId("pinned-items"));
}

function getPinnedCard(name: string) {
  const card = getPinnedSection()
    .getAllByRole("link")
    .find((link) => within(link).queryByText(name) != null);
  if (!card) {
    throw new Error(`No pinned card named ${name}`);
  }
  return card;
}

async function openRowMenu(name: string) {
  const table = within(await screen.findByTestId("collection-table"));
  await table.findByText(name);
  const row = table
    .getAllByRole("row")
    .find((row) => within(row).queryByText(name) != null);
  if (!row) {
    throw new Error(`No table row for ${name}`);
  }
  await userEvent.click(within(row).getByRole("button", { name: "Actions" }));
}

async function openPinnedCardMenu(name: string) {
  await userEvent.click(
    within(getPinnedCard(name)).getByRole("button", { name: "Actions" }),
  );
}

describe("CollectionContent pinning from item menus", () => {
  it("pins a question without running its query and a dashboard that stays in the contents list", async () => {
    const items = createItems();
    setupItemUpdateEndpoint(items, getItem(items, QUESTION_NAME));
    setupItemUpdateEndpoint(items, getItem(items, DASHBOARD_NAME));
    const { router } = setup({ collectionItems: items });
    await screen.findByText(QUESTION_NAME);

    await openRowMenu(QUESTION_NAME);
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Pin this" }),
    );

    const questionCard = await waitFor(() => getPinnedCard(QUESTION_NAME));
    expect(getPutBodies("path:/api/card/12")).toEqual([
      { collection_position: 1 },
    ]);
    expect(within(questionCard).getByText("A question")).toBeInTheDocument();
    expect(questionCard).toHaveAttribute(
      "href",
      expect.stringContaining("/question/12"),
    );
    expect(fetchMock.callHistory.calls(/\/api\/card\/\d+\/query/)).toHaveLength(
      0,
    );
    expect(
      getPinnedSection().queryByText("Another question"),
    ).not.toBeInTheDocument();

    await openRowMenu(DASHBOARD_NAME);
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Pin this" }),
    );

    const dashboardCard = await waitFor(() => getPinnedCard(DASHBOARD_NAME));
    expect(getPutBodies("path:/api/dashboard/11")).toEqual([
      { collection_position: 1 },
    ]);
    expect(
      within(dashboardCard).getByLabelText("dashboard icon"),
    ).toBeInTheDocument();
    expect(within(dashboardCard).getByText("A dashboard")).toBeInTheDocument();
    expect(dashboardCard).toHaveAttribute(
      "href",
      expect.stringContaining("/dashboard/11"),
    );
    expect(
      within(screen.getByTestId("collection-table")).getByText(DASHBOARD_NAME),
    ).toBeInTheDocument();
    expect(getPinnedCard(QUESTION_NAME)).toBeInTheDocument();
    expect(fetchMock.callHistory.calls(/\/api\/card\/\d+\/query/)).toHaveLength(
      0,
    );

    await userEvent.click(within(dashboardCard).getByText(DASHBOARD_NAME));
    expect(
      await screen.findByRole("heading", { name: /^Dashboard page 11/ }),
    ).toBeInTheDocument();
    expect(router.location.pathname).toMatch(/^\/dashboard\/11/);

    act(() => {
      router.navigate("/");
    });
    const questionCardAfterReturn = await waitFor(() =>
      getPinnedCard(QUESTION_NAME),
    );
    await userEvent.click(
      within(questionCardAfterReturn).getByText(QUESTION_NAME),
    );
    expect(
      await screen.findByRole("heading", { name: /^Question page 12/ }),
    ).toBeInTheDocument();
    expect(router.location.pathname).toMatch(/^\/question\/12/);
  });

  it("pins a model", async () => {
    const items = createItems();
    setupItemUpdateEndpoint(items, getItem(items, MODEL_NAME));
    const { router } = setup({ collectionItems: items });

    await openRowMenu(MODEL_NAME);
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Pin this" }),
    );

    const modelCard = await waitFor(() => getPinnedCard(MODEL_NAME));
    expect(getPutBodies("path:/api/card/13")).toEqual([
      { collection_position: 1 },
    ]);
    expect(within(modelCard).getByLabelText("model icon")).toBeInTheDocument();
    expect(within(modelCard).getByText("A model")).toBeInTheDocument();
    expect(modelCard).toHaveAttribute(
      "href",
      expect.stringContaining("/model/13"),
    );

    await userEvent.click(within(modelCard).getByText("A model"));
    expect(
      await screen.findByRole("heading", { name: /^Model page 13/ }),
    ).toBeInTheDocument();
    expect(router.location.pathname).toMatch(/^\/model\/13/);
  });
});

describe("CollectionContent pinned dashboard menu", () => {
  it("opens the move and duplicate modals for the pinned dashboard and unpins it", async () => {
    mockGetBoundingClientRect();
    setupRecentViewsAndSelectionsEndpoints([], ["views", "selections"]);
    setupRootCollectionItemsEndpoint({ rootCollectionItems: [] });
    // setupDashboardEndpoints would also mock the PUT that unpins the dashboard
    fetchMock.get(
      "path:/api/dashboard/11",
      createMockDashboard({
        id: 11,
        name: DASHBOARD_NAME,
        collection_id: collection.id,
      }),
    );
    const items = createItems({ questionPosition: 1, dashboardPosition: 2 });
    setupItemUpdateEndpoint(items, getItem(items, DASHBOARD_NAME));
    setupItemUpdateEndpoint(items, getItem(items, QUESTION_NAME));
    setup({ collectionItems: items });
    await screen.findByTestId("pinned-items");
    await waitFor(() => getPinnedCard(DASHBOARD_NAME));

    await openPinnedCardMenu(DASHBOARD_NAME);
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Move" }),
    );
    await waitForLoaderToBeRemoved();
    const moveModal = await screen.findByRole("dialog");
    expect(
      within(moveModal).getByText(`Move "${DASHBOARD_NAME}"?`),
    ).toBeInTheDocument();
    await userEvent.click(
      within(moveModal).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    await openPinnedCardMenu(DASHBOARD_NAME);
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Duplicate" }),
    );
    const copyModal = await screen.findByRole("dialog");
    expect(
      within(copyModal).getByText(
        `Duplicate "${DASHBOARD_NAME}" and its questions`,
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      within(copyModal).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    await openPinnedCardMenu(DASHBOARD_NAME);
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Unpin" }),
    );
    await waitFor(() => {
      expect(
        getPinnedSection().queryByText(DASHBOARD_NAME),
      ).not.toBeInTheDocument();
    });
    expect(getPutBodies("path:/api/dashboard/11")).toEqual([
      { collection_position: null },
    ]);
    expect(getPinnedCard(QUESTION_NAME)).toBeInTheDocument();

    await openPinnedCardMenu(QUESTION_NAME);
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Unpin" }),
    );
    await waitFor(() => {
      expect(screen.queryByTestId("pinned-items")).not.toBeInTheDocument();
    });
    expect(getPutBodies("path:/api/card/12")).toEqual([
      { collection_position: null },
    ]);
  });

  it("moves a pinned dashboard to the trash", async () => {
    const items = createItems({ dashboardPosition: 1 });
    setupItemUpdateEndpoint(items, getItem(items, DASHBOARD_NAME));
    setup({ collectionItems: items });
    await waitFor(() => getPinnedCard(DASHBOARD_NAME));

    await openPinnedCardMenu(DASHBOARD_NAME);
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Move to trash" }),
    );

    await waitFor(() => {
      expect(screen.queryByTestId("pinned-items")).not.toBeInTheDocument();
    });
    expect(getPutBodies("path:/api/dashboard/11")).toEqual([
      { archived: true },
    ]);
    await waitFor(() => {
      expect(screen.queryByText(DASHBOARD_NAME)).not.toBeInTheDocument();
    });
    expect(screen.getByText(QUESTION_NAME)).toBeInTheDocument();
  });
});
