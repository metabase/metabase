import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupBookmarksEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDashboardQuestionCandidatesEndpoint,
  setupDatabasesEndpoints,
  setupNullGetUserKeyValueEndpoints,
  setupSearchEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { Route } from "metabase/router";
import type { Collection, CollectionItem } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import { CollectionContent } from "./CollectionContent";

const defaultCollection = createMockCollection({
  id: 1,
  name: "Shortcut collection",
  can_write: true,
});

const pinnedDashboard = createMockCollectionItem({
  id: 1,
  name: "Pinned dashboard",
  model: "dashboard",
  collection_position: 1,
});

const tableQuestion = createMockCollectionItem({
  id: 3,
  name: "Table question",
  model: "card",
  collection_position: null,
});

const nonArchivableCollection = createMockCollectionItem({
  id: 4,
  name: "Read-only nested collection",
  model: "collection",
  can_write: false,
  collection_position: null,
});

const defaultItems = [pinnedDashboard, tableQuestion];

// Enough items to keep the search input and type filters visible.
const toolbarItems = [
  ...defaultItems,
  ...Array.from({ length: 10 }, (_, index) =>
    createMockCollectionItem({
      id: 100 + index,
      name: `Extra card ${index + 1}`,
      model: "card",
      collection_position: null,
    }),
  ),
];

async function setup({
  collection = defaultCollection,
  collectionItems = defaultItems,
}: {
  collection?: Collection;
  collectionItems?: CollectionItem[];
} = {}) {
  setupCollectionByIdEndpoint({ collections: [collection] });
  setupCollectionsEndpoints({ collections: [collection] });
  setupCollectionItemsEndpoint({ collection, collectionItems });
  setupBookmarksEndpoints([]);
  setupDatabasesEndpoints([]);
  setupSearchEndpoints([]);
  setupNullGetUserKeyValueEndpoints();
  setupDashboardQuestionCandidatesEndpoint([]);
  setupUserMetabotPermissionsEndpoint();

  fetchMock.put(`path:/api/card/${tableQuestion.id}`, tableQuestion);
  fetchMock.put(`path:/api/dashboard/${pinnedDashboard.id}`, pinnedDashboard);

  renderWithProviders(
    <Route
      path="/"
      element={<CollectionContent collectionId={collection.id} />}
    />,
    { withRouter: true, withDND: true, withKBar: true },
  );

  if (collection.type !== "trash") {
    await screen.findByTestId("pinned-items");
  }
  await screen.findByText(tableQuestion.name);
}

function getRowSelectionButton(itemName: string) {
  const row = screen.getByRole("row", { name: new RegExp(itemName) });
  const selectionCell = within(row).getByTestId("collection-entry-check");
  return within(selectionCell).getByRole("button");
}

function getPinnedSection() {
  return within(screen.getByTestId("pinned-items"));
}

async function selectTableQuestion() {
  await userEvent.click(getRowSelectionButton(tableQuestion.name));
  expect(await screen.findByText("1 item selected")).toBeInTheDocument();
}

async function openTableQuestionActions() {
  const row = screen.getByRole("row", { name: new RegExp(tableQuestion.name) });
  await userEvent.click(within(row).getByRole("button", { name: "Actions" }));
  expect(await screen.findByRole("menu")).toBeInTheDocument();
}

async function openTypeFilter() {
  await userEvent.click(screen.getByTestId("collection-type-filter-button"));
  const popover = await screen.findByTestId("collection-type-filter-popover");
  expect(popover).toBeInTheDocument();
  return popover;
}

describe("CollectionContent selection shortcuts", () => {
  it("clears a mixed selection with Escape", async () => {
    await setup();
    await selectTableQuestion();
    await userEvent.click(
      getPinnedSection().getByRole("checkbox", { name: pinnedDashboard.name }),
    );
    expect(await screen.findByText("2 items selected")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByText(/items? selected/)).not.toBeInTheDocument();
    expect(
      getPinnedSection().getByRole("link", {
        name: new RegExp(pinnedDashboard.name),
      }),
    ).toBeInTheDocument();
  });

  it("does nothing when Escape is pressed without a selection", async () => {
    await setup();

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByText(/items? selected/)).not.toBeInTheDocument();
  });

  it("opens the trash confirmation with Delete", async () => {
    await setup();
    await selectTableQuestion();

    await userEvent.keyboard("{Delete}");

    expect(
      await screen.findByTestId("move-to-trash-confirmation"),
    ).toBeInTheDocument();
    expect(screen.getByText("Move 1 item to trash?")).toBeInTheDocument();
    const modal = screen.getByTestId("move-to-trash-confirmation");
    expect(
      within(modal).getByRole("button", { name: "Move to trash" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1 item selected")).toBeInTheDocument();
  });

  it("opens the trash confirmation with Backspace", async () => {
    await setup();
    await selectTableQuestion();

    await userEvent.keyboard("{Backspace}");

    expect(
      await screen.findByTestId("move-to-trash-confirmation"),
    ).toBeInTheDocument();
  });

  it.each(["Delete", "Backspace"])(
    "opens the trash confirmation with %s after selecting all",
    async (key) => {
      await setup();
      const selectAll = screen.getByLabelText("Select all items");
      await userEvent.click(selectAll);
      expect(selectAll).toHaveFocus();

      await userEvent.keyboard(`{${key}}`);

      expect(
        await screen.findByTestId("move-to-trash-confirmation"),
      ).toBeInTheDocument();
    },
  );

  it("clears a select-all selection with Escape while the checkbox is focused", async () => {
    await setup();
    const selectAll = screen.getByLabelText("Select all items");
    await userEvent.click(selectAll);
    expect(selectAll).toHaveFocus();

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByText(/items? selected/)).not.toBeInTheDocument();
  });

  it("does not open the trash confirmation for non-archivable items", async () => {
    await setup({
      collectionItems: [...defaultItems, nonArchivableCollection],
    });
    await userEvent.click(getRowSelectionButton(nonArchivableCollection.name));
    expect(await screen.findByText("1 item selected")).toBeInTheDocument();

    await userEvent.keyboard("{Delete}");

    expect(
      screen.queryByTestId("move-to-trash-confirmation"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("1 item selected")).toBeInTheDocument();
  });

  it("archives the selection after confirmation", async () => {
    await setup();
    await selectTableQuestion();
    await userEvent.keyboard("{Delete}");

    const modal = await screen.findByTestId("move-to-trash-confirmation");
    await userEvent.click(
      within(modal).getByRole("button", { name: "Move to trash" }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls(`path:/api/card/${tableQuestion.id}`, {
          method: "PUT",
        }),
      ).toHaveLength(1);
    });
    expect(
      screen.queryByTestId("move-to-trash-confirmation"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/items? selected/)).not.toBeInTheDocument();
  });

  it("keeps the selection after cancelling", async () => {
    await setup();
    await selectTableQuestion();
    await userEvent.keyboard("{Delete}");

    await userEvent.click(
      await screen.findByRole("button", { name: "Cancel" }),
    );

    expect(
      screen.queryByTestId("move-to-trash-confirmation"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("1 item selected")).toBeInTheDocument();
  });

  it("closes the confirmation with Escape and keeps the selection", async () => {
    await setup();
    await selectTableQuestion();
    await userEvent.keyboard("{Delete}");
    expect(
      await screen.findByTestId("move-to-trash-confirmation"),
    ).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    expect(
      screen.queryByTestId("move-to-trash-confirmation"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("1 item selected")).toBeInTheDocument();
  });

  it("closes an open item menu with Escape and keeps the selection", async () => {
    await setup();
    await selectTableQuestion();
    await openTableQuestionActions();

    await userEvent.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
    expect(screen.getByText("1 item selected")).toBeInTheDocument();
  });

  it.each(["Delete", "Backspace"])(
    "does not open the trash confirmation with %s while an item menu is open",
    async (key) => {
      await setup();
      await selectTableQuestion();
      await openTableQuestionActions();

      await userEvent.keyboard(`{${key}}`);

      expect(
        screen.queryByTestId("move-to-trash-confirmation"),
      ).not.toBeInTheDocument();
      expect(screen.getByText("1 item selected")).toBeInTheDocument();
    },
  );

  it("closes the type filter with Escape and keeps the selection", async () => {
    await setup({ collectionItems: toolbarItems });
    await selectTableQuestion();
    const popover = await openTypeFilter();
    popover.focus();

    await userEvent.keyboard("{Escape}");

    await waitFor(() => {
      expect(
        screen.queryByTestId("collection-type-filter-popover"),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByText("1 item selected")).toBeInTheDocument();
  });

  it.each(["Delete", "Backspace"])(
    "does not open the trash confirmation with %s while the type filter is open",
    async (key) => {
      await setup({ collectionItems: toolbarItems });
      await selectTableQuestion();
      const popover = await openTypeFilter();
      const filterCheckbox = within(popover).getByRole("checkbox", {
        name: "Dashboard",
      });
      filterCheckbox.focus();
      expect(filterCheckbox).toHaveFocus();

      await userEvent.keyboard(`{${key}}`);

      expect(
        screen.queryByTestId("move-to-trash-confirmation"),
      ).not.toBeInTheDocument();
      expect(
        screen.getByTestId("collection-type-filter-popover"),
      ).toBeInTheDocument();
      expect(screen.getByText("1 item selected")).toBeInTheDocument();
    },
  );

  it("does not open the confirmation from the collection search input", async () => {
    await setup({ collectionItems: toolbarItems });
    await selectTableQuestion();
    const searchInput = screen.getByRole("textbox", {
      name: "Search items in this collection",
    });
    await userEvent.type(searchInput, "test");

    await userEvent.keyboard("{Delete}");

    expect(
      screen.queryByTestId("move-to-trash-confirmation"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("1 item selected")).toBeInTheDocument();
  });

  it("does not bind trash shortcuts in the trash collection", async () => {
    await setup({
      collection: createMockCollection({
        ...defaultCollection,
        type: "trash",
      }),
    });
    await selectTableQuestion();

    await userEvent.keyboard("{Delete}");
    expect(
      screen.queryByTestId("move-to-trash-confirmation"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("1 item selected")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText(/items? selected/)).not.toBeInTheDocument();
  });
});
