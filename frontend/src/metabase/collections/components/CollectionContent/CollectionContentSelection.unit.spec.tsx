import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupBookmarksEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDashboardEndpoints,
  setupDashboardQuestionCandidatesEndpoint,
  setupDatabasesEndpoints,
  setupNullGetUserKeyValueEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupRootCollectionItemsEndpoint,
  setupSearchEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { createMockAppState, createMockState } from "__support__/state";
import {
  act,
  fireEvent,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import * as Analytics from "metabase/analytics";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { Route } from "metabase/router";
import type {
  Collection,
  CollectionId,
  CollectionItem,
  User,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockUser,
} from "metabase-types/api/mocks";

import CollectionLanding from "../CollectionLanding";

import { CollectionContent } from "./CollectionContent";

const defaultCollection = createMockCollection({
  id: 1,
  name: "Selection collection",
  can_write: true,
});

const pinnedDashboard = createMockCollectionItem({
  id: 1,
  name: "Pinned dashboard",
  model: "dashboard",
  collection_position: 1,
});

const pinnedQuestion = createMockCollectionItem({
  id: 2,
  name: "Pinned question",
  model: "card",
  collection_position: 2,
});

const tableQuestion = createMockCollectionItem({
  id: 3,
  name: "Table question",
  model: "card",
  collection_position: null,
});

const tableDashboard = createMockCollectionItem({
  id: 4,
  name: "Table dashboard",
  model: "dashboard",
  collection_position: null,
});

const defaultItems = [
  pinnedDashboard,
  pinnedQuestion,
  tableQuestion,
  tableDashboard,
];

type SetupOpts = {
  collection?: Collection;
  collectionItems?: CollectionItem[];
  otherCollections?: Collection[];
  rootCollection?: Collection;
  currentUser?: User;
  /** Enables the drag sources, as the app does once its DnD provider mounts */
  isDndAvailable?: boolean;
};

function setupCommonEndpoints() {
  setupBookmarksEndpoints([]);
  setupDatabasesEndpoints([]);
  setupSearchEndpoints([]);
  setupNullGetUserKeyValueEndpoints();
  setupDashboardQuestionCandidatesEndpoint([]);
  setupUserMetabotPermissionsEndpoint();
}

async function setup({
  collection = defaultCollection,
  collectionItems = defaultItems,
  otherCollections = [],
  rootCollection = createMockCollection(ROOT_COLLECTION),
  currentUser = createMockUser(),
  isDndAvailable = false,
}: SetupOpts = {}) {
  setupCollectionByIdEndpoint({
    collections: [collection, rootCollection, ...otherCollections],
  });
  setupCollectionsEndpoints({
    collections: [collection, ...otherCollections],
    rootCollection,
  });
  setupCollectionItemsEndpoint({ collection, collectionItems });
  setupCommonEndpoints();

  renderWithProviders(
    <Route
      path="/"
      element={<CollectionContent collectionId={collection.id} />}
    />,
    {
      withRouter: true,
      withDND: true,
      storeInitialState: createMockState({
        currentUser,
        app: createMockAppState({ isDndAvailable }),
      }),
    },
  );

  if (collectionItems.some((item) => item.collection_position != null)) {
    await screen.findByTestId("pinned-items");
  }
  await screen.findByText(tableQuestion.name);
}

function getRowSelectionCell(itemName: string) {
  const row = screen.getByRole("row", { name: new RegExp(itemName) });
  return within(row).getByTestId("collection-entry-check");
}

function getRowSelectionButton(itemName: string) {
  return within(getRowSelectionCell(itemName)).getByRole("button");
}

function getRowSelectionCheckbox(itemName: string) {
  return within(getRowSelectionCell(itemName)).getByRole("checkbox");
}

function getPinnedSection() {
  return within(screen.getByTestId("pinned-items"));
}

function getPinnedCard(itemName: string) {
  return getPinnedSection().getByRole("checkbox", { name: itemName });
}

function getPinnedLink(itemName: string) {
  return getPinnedSection().getByRole("link", { name: new RegExp(itemName) });
}

describe("CollectionContent selection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("tracks entering selection mode once per selection session", async () => {
    const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
    await setup();

    await userEvent.click(getRowSelectionButton(tableQuestion.name));
    await waitFor(() => {
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "collection_select_mode_entered",
        target_id: defaultCollection.id,
      });
    });

    await userEvent.click(getRowSelectionButton(tableDashboard.name));
    expect(trackSimpleEvent).toHaveBeenCalledTimes(1);

    await userEvent.click(getRowSelectionButton(tableQuestion.name));
    await userEvent.click(getRowSelectionButton(tableDashboard.name));
    await userEvent.click(getRowSelectionButton(tableQuestion.name));

    await waitFor(() => {
      expect(trackSimpleEvent).toHaveBeenCalledTimes(2);
    });
    expect(trackSimpleEvent).toHaveBeenLastCalledWith({
      event: "collection_select_mode_entered",
      target_id: defaultCollection.id,
    });
  });

  it("should render pinned cards as links when nothing is selected", async () => {
    await setup();

    expect(getPinnedLink(pinnedDashboard.name)).toBeInTheDocument();
    expect(getPinnedLink(pinnedQuestion.name)).toBeInTheDocument();
    expect(
      getPinnedSection().queryByRole("checkbox", {
        name: pinnedDashboard.name,
      }),
    ).not.toBeInTheDocument();
  });

  it("should list pinned items as table rows as well as pinned cards", async () => {
    await setup();

    expect(
      screen.getByRole("row", { name: new RegExp(pinnedDashboard.name) }),
    ).toBeInTheDocument();
    expect(getPinnedLink(pinnedDashboard.name)).toBeInTheDocument();
  });

  it("should check the table row of a pinned item selected from its card", async () => {
    await setup();

    await userEvent.click(getRowSelectionButton(tableQuestion.name));
    await userEvent.click(getPinnedCard(pinnedDashboard.name));

    expect(await screen.findByText("2 items selected")).toBeInTheDocument();
    expect(getRowSelectionCheckbox(pinnedDashboard.name)).toBeChecked();
  });

  it("should check the pinned card of an item selected from its table row", async () => {
    await setup();

    await userEvent.click(getRowSelectionButton(pinnedDashboard.name));

    expect(await screen.findByText("1 item selected")).toBeInTheDocument();
    expect(getPinnedCard(pinnedDashboard.name)).toBeChecked();
  });

  it("should toggle the same selection entry from either representation", async () => {
    await setup();

    await userEvent.click(getRowSelectionButton(pinnedDashboard.name));
    expect(await screen.findByText("1 item selected")).toBeInTheDocument();

    await userEvent.click(getPinnedCard(pinnedDashboard.name));

    expect(screen.queryByText(/items? selected/)).not.toBeInTheDocument();
    expect(getRowSelectionCheckbox(pinnedDashboard.name)).not.toBeChecked();
  });

  it("should add a pinned card to the same selection as a table row", async () => {
    await setup();

    await userEvent.click(getRowSelectionButton(tableQuestion.name));
    expect(await screen.findByText("1 item selected")).toBeInTheDocument();

    await userEvent.click(getPinnedCard(pinnedDashboard.name));

    expect(await screen.findByText("2 items selected")).toBeInTheDocument();
    expect(getPinnedCard(pinnedDashboard.name)).toBeChecked();
    expect(screen.getByLabelText("Select all items")).toBePartiallyChecked();
  });

  it("should toggle a selected pinned card off", async () => {
    await setup();

    await userEvent.click(getRowSelectionButton(tableQuestion.name));
    await userEvent.click(getPinnedCard(pinnedDashboard.name));
    expect(await screen.findByText("2 items selected")).toBeInTheDocument();

    await userEvent.click(getPinnedCard(pinnedDashboard.name));

    expect(await screen.findByText("1 item selected")).toBeInTheDocument();
    expect(getPinnedCard(pinnedDashboard.name)).not.toBeChecked();
  });

  it("should select every listed item exactly once with select all", async () => {
    await setup();

    await userEvent.click(getRowSelectionButton(tableQuestion.name));
    await userEvent.click(screen.getByLabelText("Select all items"));

    expect(await screen.findByText("4 items selected")).toBeInTheDocument();
    expect(screen.getByLabelText("Select all items")).toBeChecked();
    expect(
      screen.getByLabelText("Select all items"),
    ).not.toBePartiallyChecked();
    expect(getPinnedCard(pinnedDashboard.name)).toBeChecked();
    expect(getPinnedCard(pinnedQuestion.name)).toBeChecked();
    for (const item of defaultItems) {
      expect(getRowSelectionCheckbox(item.name)).toBeChecked();
    }

    await userEvent.click(getPinnedCard(pinnedQuestion.name));
    expect(await screen.findByText("3 items selected")).toBeInTheDocument();
    expect(getPinnedCard(pinnedQuestion.name)).not.toBeChecked();
    expect(getRowSelectionCheckbox(tableQuestion.name)).toBeChecked();
    expect(screen.getByLabelText("Select all items")).toBePartiallyChecked();

    await userEvent.click(getPinnedCard(pinnedQuestion.name));
    expect(await screen.findByText("4 items selected")).toBeInTheDocument();
    expect(screen.getByLabelText("Select all items")).toBeChecked();
    expect(
      screen.getByLabelText("Select all items"),
    ).not.toBePartiallyChecked();
  });

  it("should select every listed item exactly once with select all from an empty selection", async () => {
    await setup();

    await userEvent.click(screen.getByLabelText("Select all items"));

    expect(await screen.findByText("4 items selected")).toBeInTheDocument();
    expect(getPinnedCard(pinnedDashboard.name)).toBeChecked();
    expect(getPinnedCard(pinnedQuestion.name)).toBeChecked();
  });

  it("should keep the header checkbox indeterminate while pinned rows stay unselected", async () => {
    await setup();

    await userEvent.click(getRowSelectionButton(tableQuestion.name));
    await userEvent.click(getRowSelectionButton(tableDashboard.name));

    expect(await screen.findByText("2 items selected")).toBeInTheDocument();
    expect(screen.getByLabelText("Select all items")).toBePartiallyChecked();

    await userEvent.click(getPinnedCard(pinnedDashboard.name));
    await userEvent.click(getPinnedCard(pinnedQuestion.name));

    expect(await screen.findByText("4 items selected")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Select all items"),
    ).not.toBePartiallyChecked();
  });

  it("should complete select all from a pinned-only selection", async () => {
    await setup();

    await userEvent.click(getRowSelectionButton(tableQuestion.name));
    await userEvent.click(getPinnedCard(pinnedDashboard.name));
    await userEvent.click(getRowSelectionButton(tableQuestion.name));

    expect(await screen.findByText("1 item selected")).toBeInTheDocument();
    expect(screen.getByLabelText("Select all items")).toBeChecked();
    expect(screen.getByLabelText("Select all items")).toBePartiallyChecked();

    await userEvent.click(screen.getByLabelText("Select all items"));

    expect(await screen.findByText("4 items selected")).toBeInTheDocument();
  });

  it("should restore pinned card navigation after deselecting all", async () => {
    await setup();

    await userEvent.click(getRowSelectionButton(tableQuestion.name));
    await userEvent.click(screen.getByLabelText("Select all items"));
    expect(await screen.findByText("4 items selected")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Select all items"));

    expect(await getPinnedSection().findAllByRole("link")).toHaveLength(2);
    expect(getPinnedSection().queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/items? selected/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Select all items")).not.toBeChecked();
    expect(
      screen.getByLabelText("Select all items"),
    ).not.toBePartiallyChecked();
    for (const item of defaultItems) {
      expect(getRowSelectionCheckbox(item.name)).not.toBeChecked();
    }
  });

  it("should not expose selection in a read-only collection", async () => {
    await setup({
      collection: createMockCollection({
        ...defaultCollection,
        can_write: false,
      }),
    });

    expect(screen.getByText(tableQuestion.name)).toBeInTheDocument();
    expect(getPinnedSection().getAllByRole("link")).toHaveLength(2);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("should not offer to pin, but should offer to duplicate a dashboard to the personal collection, in a read-only collection (metabase#20043)", async () => {
    const personalCollection = createMockCollection({
      id: 30,
      name: "Read Only Tableton's Personal Collection",
      personal_owner_id: 5,
      is_personal: true,
      can_write: true,
    });
    const readOnlyCollection = createMockCollection({
      ...defaultCollection,
      can_write: false,
    });
    setupDashboardEndpoints(
      createMockDashboard({
        id: tableDashboard.id,
        name: tableDashboard.name,
        collection_id: readOnlyCollection.id,
      }),
    );
    await setup({
      collection: readOnlyCollection,
      collectionItems: defaultItems.map((item) => ({
        ...item,
        collection_id: readOnlyCollection.id,
      })),
      otherCollections: [personalCollection],
      rootCollection: createMockCollection({
        ...ROOT_COLLECTION,
        can_write: false,
      }),
      currentUser: createMockUser({
        id: 5,
        personal_collection_id: personalCollection.id,
      }),
    });

    const row = screen.getByRole("row", {
      name: new RegExp(tableDashboard.name),
    });
    await userEvent.click(within(row).getByLabelText("Actions"));

    const menu = await screen.findByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: /Duplicate/ }),
    ).toBeInTheDocument();
    expect(within(menu).queryByText("Pin this")).not.toBeInTheDocument();

    await userEvent.click(
      within(menu).getByRole("menuitem", { name: /Duplicate/ }),
    );

    const modal = await screen.findByRole("dialog", {
      name: new RegExp(`^Duplicate "${tableDashboard.name}"`),
    });
    await waitFor(() =>
      expect(
        within(modal).getByTestId("collection-picker-button"),
      ).toHaveTextContent(personalCollection.name),
    );
  });

  it("should toggle a table row with shift+click without navigating", async () => {
    const events = userEvent.setup();
    await setup();

    await events.keyboard("{Shift>}");
    await events.click(screen.getByRole("link", { name: tableQuestion.name }));
    await events.keyboard("{/Shift}");

    expect(await screen.findByText("1 item selected")).toBeInTheDocument();
    expect(getPinnedCard(pinnedDashboard.name)).toBeInTheDocument();

    await events.keyboard("{Shift>}");
    await events.click(screen.getByRole("link", { name: tableQuestion.name }));
    await events.keyboard("{/Shift}");

    expect(screen.queryByText(/items? selected/)).not.toBeInTheDocument();
  });

  it("should select a pinned card from an empty selection with shift+click", async () => {
    const events = userEvent.setup();
    await setup();
    const pinnedCard = getPinnedLink(pinnedDashboard.name);

    await events.keyboard("{Shift>}");
    await events.click(pinnedCard);
    await events.keyboard("{/Shift}");

    expect(await screen.findByText("1 item selected")).toBeInTheDocument();
    expect(getPinnedCard(pinnedDashboard.name)).toBeChecked();
  });

  it("should select a pinned card from its overflow menu", async () => {
    await setup();
    const pinnedCard = getPinnedLink(pinnedDashboard.name);

    await userEvent.click(
      within(pinnedCard).getByRole("button", { name: "Actions" }),
    );
    await userEvent.click(await screen.findByText("Select"));

    expect(await screen.findByText("1 item selected")).toBeInTheDocument();
    expect(getPinnedCard(pinnedDashboard.name)).toBeChecked();
  });

  it("should select a table row from its overflow menu", async () => {
    await setup();
    const row = screen.getByRole("row", {
      name: new RegExp(tableQuestion.name),
    });

    await userEvent.click(within(row).getByRole("button", { name: "Actions" }));
    await userEvent.click(await screen.findByText("Select"));

    expect(await screen.findByText("1 item selected")).toBeInTheDocument();
  });

  it("should adapt the bulk action bar to the selection composition", async () => {
    await setup();

    await userEvent.click(getRowSelectionButton(tableQuestion.name));
    expect(await screen.findByText("1 item selected")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Move to trash" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(
      await screen.findByRole("menuitem", { name: "Pin all" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Unpin all" }),
    ).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    await userEvent.click(getPinnedCard(pinnedDashboard.name));
    expect(screen.getByRole("button", { name: "Move" })).toBeInTheDocument();
    await userEvent.click(
      await screen.findByRole("button", { name: "More actions" }),
    );
    expect(
      await screen.findByRole("menuitem", { name: "Pin all" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Unpin all" }),
    ).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    await userEvent.click(getRowSelectionButton(tableQuestion.name));
    expect(
      await screen.findByRole("button", { name: "Unpin all" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(
      await screen.findByRole("menuitem", { name: "Move" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Pin all" }),
    ).not.toBeInTheDocument();
  });

  it("should open a row menu without selecting on shift+click", async () => {
    await setup();
    const row = screen.getByRole("row", {
      name: new RegExp(tableQuestion.name),
    });
    const actions = within(row).getByRole("button", { name: "Actions" });

    fireEvent.click(within(actions).getByLabelText("ellipsis icon"), {
      shiftKey: true,
    });

    expect(await screen.findByText("Select")).toBeInTheDocument();
    expect(screen.queryByText(/items? selected/)).not.toBeInTheDocument();
  });

  it("clears the selection when another collection opens (metabase#16491)", async () => {
    const otherCollection = createMockCollection({
      id: 2,
      name: "Other collection",
      can_write: true,
    });
    const otherItem = createMockCollectionItem({
      id: 20,
      name: "Other collection question",
      model: "card",
    });
    setupCollectionByIdEndpoint({
      collections: [defaultCollection, otherCollection],
    });
    setupCollectionsEndpoints({
      collections: [defaultCollection, otherCollection],
    });
    setupCollectionItemsEndpoint({
      collection: defaultCollection,
      collectionItems: defaultItems,
    });
    setupCollectionItemsEndpoint({
      collection: otherCollection,
      collectionItems: [otherItem],
    });
    setupCommonEndpoints();
    const { router } = renderWithProviders(
      <Route path="/collection/:slug" element={<CollectionLanding />} />,
      {
        withRouter: true,
        withDND: true,
        initialRoute: `/collection/${defaultCollection.id}`,
      },
    );

    expect(await screen.findByText(tableDashboard.name)).toBeInTheDocument();
    await userEvent.click(getRowSelectionButton(tableDashboard.name));
    expect(await screen.findByText("1 item selected")).toBeInTheDocument();

    await act(async () => {
      await router?.navigate(`/collection/${otherCollection.id}`);
    });

    expect(await screen.findByText(otherItem.name)).toBeInTheDocument();
    expect(screen.queryByText(/items? selected/)).not.toBeInTheDocument();
  });

  it("moves the selection to the trash from the bulk actions menu and removes it from the list (metabase#16496)", async () => {
    fetchMock.put(`path:/api/card/${tableQuestion.id}`, async () => {
      setupCollectionItemsEndpoint({
        collection: defaultCollection,
        collectionItems: defaultItems.filter(
          (item) => item.id !== tableQuestion.id,
        ),
      });
      return { ...tableQuestion, archived: true };
    });
    await setup();

    await userEvent.click(getRowSelectionButton(tableQuestion.name));
    expect(await screen.findByText("1 item selected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Move to trash" }),
    );
    const confirmation = await screen.findByTestId(
      "move-to-trash-confirmation",
    );
    await userEvent.click(
      within(confirmation).getByRole("button", { name: "Move to trash" }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("row", { name: new RegExp(tableQuestion.name) }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("row", { name: new RegExp(tableDashboard.name) }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/items? selected/)).not.toBeInTheDocument();
    const calls = fetchMock.callHistory.calls(
      `path:/api/card/${tableQuestion.id}`,
      { method: "PUT" },
    );
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0].options.body))).toMatchObject({
      archived: true,
    });
  });

  describe("drag and drop (metabase#37329)", () => {
    const nestedCollection = createMockCollectionItem({
      id: 5,
      name: "Nested collection",
      model: "collection",
      can_write: true,
      collection_position: null,
    });
    const destinationCollection = createMockCollectionItem({
      id: 6,
      name: "Destination collection",
      model: "collection",
      can_write: true,
      collection_position: null,
    });
    const dragItems = [
      tableQuestion,
      tableDashboard,
      nestedCollection,
      destinationCollection,
    ];

    function getRow(itemName: string) {
      return screen.getByRole("row", { name: new RegExp(itemName) });
    }

    function startDrag(itemName: string) {
      const dataTransfer = {
        types: [],
        setData: () => undefined,
        getData: () => "",
        setDragImage: () => undefined,
      };
      const source = getRow(itemName);
      const isStarted = fireEvent.dragStart(source, {
        dataTransfer,
        clientX: 10,
        clientY: 10,
      });
      return { source, dataTransfer, isStarted };
    }

    function dropOn(
      targetName: string,
      { source, dataTransfer }: ReturnType<typeof startDrag>,
    ) {
      const target = getRow(targetName);
      fireEvent.dragEnter(target, { dataTransfer, clientX: 20, clientY: 20 });
      fireEvent.dragOver(target, { dataTransfer, clientX: 20, clientY: 20 });
      fireEvent.drop(target, { dataTransfer, clientX: 20, clientY: 20 });
      fireEvent.dragEnd(source, { dataTransfer });
    }

    function getMoveCalls() {
      return fetchMock.callHistory
        .calls(/\/api\/(card|dashboard|collection)\/\d+$/, { method: "PUT" })
        .map((call) => ({
          url: new URL(call.url).pathname,
          body: JSON.parse(String(call.options.body)),
        }));
    }

    function setupMoveEndpoints(collectionId: CollectionId) {
      // Read before the move to offer an undo
      fetchMock.get(
        `path:/api/card/${tableQuestion.id}`,
        createMockCard({ id: tableQuestion.id, collection_id: 1 }),
      );
      fetchMock.put(`path:/api/card/${tableQuestion.id}`, async () => {
        setupCollectionItemsEndpoint({
          collection: defaultCollection,
          collectionItems: dragItems.filter(
            (item) => item.id !== tableQuestion.id || item.model !== "card",
          ),
        });
        return { ...tableQuestion, collection_id: collectionId };
      });
      fetchMock.put(`path:/api/collection/${nestedCollection.id}`, {});
      fetchMock.put(`path:/api/dashboard/${tableDashboard.id}`, {});
    }

    it("does not let a sub-collection start a drag", async () => {
      setupMoveEndpoints(destinationCollection.id);
      await setup({ collectionItems: dragItems, isDndAvailable: true });

      expect(
        within(getRow(nestedCollection.name)).getByRole("link", {
          name: nestedCollection.name,
        }),
      ).toHaveAttribute("draggable", "false");
      expect(
        within(getRow(tableQuestion.name)).getByRole("link", {
          name: tableQuestion.name,
        }),
      ).toHaveAttribute("draggable", "true");

      // A cancelled dragstart is how the browser is told not to drag at all,
      // so no drop follows it.
      const collectionDrag = startDrag(nestedCollection.name);
      expect(collectionDrag.isStarted).toBe(false);
      expect(
        screen.queryByTestId("items-drag-preview"),
      ).not.toBeInTheDocument();
      fireEvent.dragEnd(collectionDrag.source, {
        dataTransfer: collectionDrag.dataTransfer,
      });

      const questionDrag = startDrag(tableQuestion.name);
      expect(questionDrag.isStarted).toBe(true);
      expect(await screen.findByTestId("items-drag-preview")).toHaveTextContent(
        "Move 1 item",
      );
      fireEvent.dragEnd(questionDrag.source, {
        dataTransfer: questionDrag.dataTransfer,
      });

      expect(getRow(nestedCollection.name)).toBeInTheDocument();
      expect(getMoveCalls()).toEqual([]);
    });

    it("rejects a mixed selection that includes a sub-collection as one operation, then moves the question alone", async () => {
      setupMoveEndpoints(destinationCollection.id);
      await setup({ collectionItems: dragItems, isDndAvailable: true });

      await userEvent.click(getRowSelectionButton(tableQuestion.name));
      await userEvent.click(getRowSelectionButton(nestedCollection.name));
      expect(await screen.findByText("2 items selected")).toBeInTheDocument();

      const mixedDrag = startDrag(tableQuestion.name);
      expect(await screen.findByTestId("items-drag-preview")).toHaveTextContent(
        "Move 2 items",
      );
      dropOn(destinationCollection.name, mixedDrag);

      expect(getRow(tableQuestion.name)).toBeInTheDocument();
      expect(getRow(nestedCollection.name)).toBeInTheDocument();
      expect(getRow(destinationCollection.name)).toBeInTheDocument();
      expect(getMoveCalls()).toEqual([]);

      await userEvent.click(getRowSelectionButton(nestedCollection.name));
      expect(await screen.findByText("1 item selected")).toBeInTheDocument();

      const questionDrag = startDrag(tableQuestion.name);
      expect(await screen.findByTestId("items-drag-preview")).toHaveTextContent(
        "Move 1 item",
      );
      dropOn(destinationCollection.name, questionDrag);

      await waitFor(() => {
        expect(
          screen.queryByRole("row", { name: new RegExp(tableQuestion.name) }),
        ).not.toBeInTheDocument();
      });
      expect(getMoveCalls()).toEqual([
        {
          url: `/api/card/${tableQuestion.id}`,
          body: expect.objectContaining({
            collection_id: destinationCollection.id,
          }),
        },
      ]);
    });
  });

  describe("moving collections (metabase#45248)", () => {
    const movingCollection = createMockCollectionItem({
      id: 7,
      name: "Moving collection",
      model: "collection",
      can_write: true,
      collection_id: defaultCollection.id,
      location: `/${defaultCollection.id}/`,
      here: ["collection"],
      below: ["collection"],
      collection_position: null,
    });
    const siblingCollection = createMockCollectionItem({
      id: 8,
      name: "Sibling collection",
      model: "collection",
      can_write: true,
      collection_id: defaultCollection.id,
      location: `/${defaultCollection.id}/`,
      here: ["collection"],
      below: ["collection"],
      collection_position: null,
    });
    const items = [tableQuestion, movingCollection, siblingCollection];

    function setupPicker() {
      mockGetBoundingClientRect();
      setupRecentViewsAndSelectionsEndpoints([]);
      setupRootCollectionItemsEndpoint({
        rootCollectionItems: [
          createMockCollectionItem({
            id: Number(defaultCollection.id),
            name: defaultCollection.name,
            model: "collection",
            can_write: true,
            location: "/",
            here: ["collection", "card"],
            below: ["collection"],
          }),
        ],
      });
      [movingCollection, siblingCollection].forEach((item) =>
        setupCollectionItemsEndpoint({
          collection: { id: item.id },
          collectionItems: [],
        }),
      );
      fetchMock.get("path:/api/user/recipients", { data: [] });
    }

    function getPickerItem(name: string) {
      return within(screen.getByTestId("entity-picker-modal")).getByRole(
        "link",
        { name: new RegExp(`^[\\w-]+ icon ${name}`) },
      );
    }

    it("disables the collection moved from its row menu and starts in the current collection", async () => {
      setupPicker();
      await setup({ collectionItems: items });

      const row = screen.getByRole("row", {
        name: new RegExp(movingCollection.name),
      });
      await userEvent.click(
        within(row).getByRole("button", { name: "Actions" }),
      );
      await userEvent.click(
        await screen.findByRole("menuitem", { name: "Move" }),
      );

      await waitFor(() => {
        expect(getPickerItem(movingCollection.name)).toHaveAttribute(
          "data-disabled",
        );
      });
      expect(getPickerItem(siblingCollection.name)).not.toHaveAttribute(
        "data-disabled",
      );
      expect(getPickerItem(defaultCollection.name)).toHaveAttribute(
        "data-active",
        "true",
      );
    });

    it("disables every collection in a bulk move", async () => {
      setupPicker();
      await setup({ collectionItems: items });

      await userEvent.click(getRowSelectionButton(tableQuestion.name));
      await userEvent.click(getRowSelectionButton(movingCollection.name));
      expect(await screen.findByText("2 items selected")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Move" }));

      await waitFor(() => {
        expect(getPickerItem(movingCollection.name)).toHaveAttribute(
          "data-disabled",
        );
      });
      expect(getPickerItem(siblingCollection.name)).not.toHaveAttribute(
        "data-disabled",
      );
    });
  });
});
