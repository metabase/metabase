import userEvent from "@testing-library/user-event";

import {
  setupBookmarksEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDashboardEndpoints,
  setupDashboardQuestionCandidatesEndpoint,
  setupDatabasesEndpoints,
  setupNullGetUserKeyValueEndpoints,
  setupSearchEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import * as Analytics from "metabase/analytics";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { Route } from "metabase/router";
import type { Collection, CollectionItem, User } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockUser,
} from "metabase-types/api/mocks";

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
};

async function setup({
  collection = defaultCollection,
  collectionItems = defaultItems,
  otherCollections = [],
  rootCollection = createMockCollection(ROOT_COLLECTION),
  currentUser = createMockUser(),
}: SetupOpts = {}) {
  setupCollectionByIdEndpoint({
    collections: [collection, rootCollection, ...otherCollections],
  });
  setupCollectionsEndpoints({
    collections: [collection, ...otherCollections],
    rootCollection,
  });
  setupCollectionItemsEndpoint({ collection, collectionItems });
  setupBookmarksEndpoints([]);
  setupDatabasesEndpoints([]);
  setupSearchEndpoints([]);
  setupNullGetUserKeyValueEndpoints();
  setupDashboardQuestionCandidatesEndpoint([]);
  setupUserMetabotPermissionsEndpoint();

  renderWithProviders(
    <Route
      path="/"
      element={<CollectionContent collectionId={collection.id} />}
    />,
    {
      withRouter: true,
      withDND: true,
      storeInitialState: createMockState({ currentUser }),
    },
  );

  await screen.findByTestId("pinned-items");
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
});
