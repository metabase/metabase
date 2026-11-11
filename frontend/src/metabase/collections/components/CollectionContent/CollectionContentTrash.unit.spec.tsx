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
  setupRecentViewsAndSelectionsEndpoints,
  setupRootCollectionItemsEndpoint,
  setupSearchEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { Route } from "metabase/router";
import type { Collection, CollectionItem } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import { CollectionContent } from "./CollectionContent";

const TRASH_COLLECTION_ID = 20000000;

const TRASH_COLLECTION = createMockCollection({
  id: TRASH_COLLECTION_ID,
  name: "Trash",
  type: "trash",
  can_write: true,
});

const FIRST_COLLECTION = createMockCollection({
  id: 1,
  name: "First collection",
});

const createTrashedItem = (opts: Partial<CollectionItem>) =>
  createMockCollectionItem({
    archived: true,
    can_write: true,
    can_restore: true,
    can_delete: true,
    ...opts,
  });

interface SetupOpts {
  collection?: Collection;
  collectionItems?: CollectionItem[];
  archivedItems?: CollectionItem[];
}

async function setup({
  collection = TRASH_COLLECTION,
  collectionItems = [],
  archivedItems,
}: SetupOpts = {}) {
  setupCollectionsEndpoints({
    collections: [FIRST_COLLECTION],
    trashCollection: TRASH_COLLECTION,
  });
  setupCollectionByIdEndpoint({ collections: [collection, FIRST_COLLECTION] });
  setupCollectionItemsEndpoint({ collection, collectionItems, archivedItems });
  setupCollectionItemsEndpoint({
    collection: FIRST_COLLECTION,
    collectionItems: [],
  });
  if (collection.id !== "root") {
    setupRootCollectionItemsEndpoint({ rootCollectionItems: [] });
  }
  setupRecentViewsAndSelectionsEndpoints([]);
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
    { withRouter: true, withDND: true },
  );

  await waitForLoaderToBeRemoved();
  if (collectionItems.length > 0) {
    await screen.findByText(collectionItems[0].name);
  }
}

function getRow(name: string) {
  const rows = screen
    .getAllByRole("row")
    .filter((row) => within(row).queryByText(name) !== null);
  expect(rows).toHaveLength(1);
  return rows[0];
}

async function openRowMenu(name: string) {
  await userEvent.click(
    within(getRow(name)).getByRole("button", { name: "Actions" }),
  );
}

function getSelectionCheckbox(name: string) {
  return within(getRow(name)).getByRole("checkbox");
}

async function toggleSelection(name: string) {
  const selectionCell = within(getRow(name)).getByTestId(
    "collection-entry-check",
  );
  await userEvent.click(within(selectionCell).getByRole("button"));
}

describe("CollectionContent > trash", () => {
  describe("root trash collection", () => {
    const archivedCollection = createTrashedItem({
      id: 10,
      model: "collection",
      name: "Collection A",
    });
    const pinnedModel = createTrashedItem({
      id: 11,
      model: "dataset",
      name: "Model A",
      collection_position: 1,
    });
    const archivedCollectionB = createTrashedItem({
      id: 12,
      model: "collection",
      name: "Collection B",
    });

    const trashItems = [archivedCollectionB, archivedCollection, pinnedModel];

    it("should label the table columns as deleted by and deleted at", async () => {
      await setup({ collectionItems: trashItems });

      const tableHead = await screen.findByTestId("items-table-head");
      expect(within(tableHead).getByText("Deleted by")).toBeInTheDocument();
      expect(within(tableHead).getByText("Deleted at")).toBeInTheDocument();
      expect(
        within(tableHead).queryByText("Last edited by"),
      ).not.toBeInTheDocument();
    });

    it("should offer restore and permanent delete instead of move to trash", async () => {
      await setup({ collectionItems: trashItems });

      await openRowMenu(archivedCollection.name);
      const menu = await screen.findByRole("menu");
      expect(within(menu).getByText("Restore")).toBeInTheDocument();
      expect(within(menu).getByText("Delete permanently")).toBeInTheDocument();
      expect(within(menu).queryByText("Move to trash")).not.toBeInTheDocument();
    });

    it("should grey out the icons of trashed items", async () => {
      await setup({ collectionItems: trashItems });

      const modelIcons = within(getRow(pinnedModel.name)).getAllByLabelText(
        "model icon",
      );
      expect(modelIcons).not.toHaveLength(0);
      modelIcons.forEach((icon) => {
        expect(icon).toHaveStyle({
          color: "var(--mantine-color-text-disabled-text)",
        });
      });
    });

    it("should list pinned items in the table instead of a pinned section", async () => {
      await setup({ collectionItems: trashItems });

      expect(await screen.findByText(pinnedModel.name)).toBeInTheDocument();
      expect(
        within(screen.getByTestId("collection-table")).getByText(
          pinnedModel.name,
        ),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("pinned-items")).not.toBeInTheDocument();
    });
  });

  it("should not list the trash in Our analytics", async () => {
    await setup({
      collection: createMockCollection(ROOT_COLLECTION),
      collectionItems: [
        createMockCollectionItem({ id: 1, model: "card", name: "Orders" }),
      ],
      archivedItems: [
        createMockCollectionItem({
          id: TRASH_COLLECTION_ID,
          model: "collection",
          name: TRASH_COLLECTION.name,
          type: "trash",
        }),
      ],
    });

    const collectionTable = screen.getByTestId("collection-table");
    expect(within(collectionTable).getByText("Orders")).toBeInTheDocument();
    expect(
      within(collectionTable).queryByText("Trash"),
    ).not.toBeInTheDocument();
  });

  describe("menus and bulk actions (metabase#44910, metabase#44911)", () => {
    const ordersQuestion = createTrashedItem({
      id: 1,
      model: "card",
      name: "Orders",
    });
    const ordersCountQuestion = createTrashedItem({
      id: 2,
      model: "card",
      name: "Orders, Count",
    });
    const ordersModel = createTrashedItem({
      id: 3,
      model: "dataset",
      name: "Orders Model",
    });

    function setupTrashedCards() {
      const collectionItems = [
        ordersQuestion,
        ordersCountQuestion,
        ordersModel,
      ];
      const removeItem = (id: number) => () => {
        const index = collectionItems.findIndex((item) => item.id === id);
        collectionItems.splice(index, 1);
        return { status: 204 };
      };
      fetchMock.delete(
        `path:/api/card/${ordersQuestion.id}`,
        removeItem(ordersQuestion.id),
      );
      fetchMock.delete(
        `path:/api/card/${ordersModel.id}`,
        removeItem(ordersModel.id),
      );
      return setup({ collectionItems });
    }

    it("should open only one context menu at a time (metabase#44910)", async () => {
      await setupTrashedCards();

      await openRowMenu(ordersQuestion.name);
      expect(await screen.findAllByRole("menu")).toHaveLength(1);

      await openRowMenu(ordersCountQuestion.name);
      await waitFor(() => {
        expect(screen.getAllByRole("menu")).toHaveLength(1);
      });
      const menu = screen.getByRole("menu");
      expect(within(menu).getByText("Move")).toBeInTheDocument();
      expect(within(menu).getByText("Restore")).toBeInTheDocument();
      expect(within(menu).getByText("Delete permanently")).toBeInTheDocument();

      await userEvent.keyboard("{Escape}");
      await waitFor(() => {
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      });
    });

    it("should keep the selection when aborting bulk actions and clear it after deleting (metabase#44911)", async () => {
      await setupTrashedCards();

      await toggleSelection(ordersQuestion.name);
      await toggleSelection(ordersModel.name);
      expect(await screen.findByText("2 items selected")).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: "Delete permanently" }),
      );
      const deleteModal = await screen.findByRole("dialog");
      expect(
        within(deleteModal).getByText("Delete 2 items permanently?"),
      ).toBeInTheDocument();
      await userEvent.click(
        within(deleteModal).getByRole("button", { name: "Cancel" }),
      );
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
      expect(getSelectionCheckbox(ordersQuestion.name)).toBeChecked();
      expect(getSelectionCheckbox(ordersModel.name)).toBeChecked();
      expect(getSelectionCheckbox(ordersCountQuestion.name)).not.toBeChecked();

      await userEvent.click(screen.getByRole("button", { name: "Move" }));
      const moveModal = await screen.findByTestId("entity-picker-modal");
      await userEvent.click(
        await within(moveModal).findByRole("button", { name: "Cancel" }),
      );
      await waitFor(() => {
        expect(
          screen.queryByTestId("entity-picker-modal"),
        ).not.toBeInTheDocument();
      });
      expect(getSelectionCheckbox(ordersQuestion.name)).toBeChecked();
      expect(getSelectionCheckbox(ordersModel.name)).toBeChecked();
      expect(screen.getByText("2 items selected")).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: "Delete permanently" }),
      );
      await userEvent.click(
        within(await screen.findByRole("dialog")).getByRole("button", {
          name: "Delete permanently",
        }),
      );

      await waitFor(() => {
        expect(screen.queryByText(ordersModel.name)).not.toBeInTheDocument();
      });
      expect(screen.queryByText(ordersQuestion.name)).not.toBeInTheDocument();
      expect(screen.getByText(ordersCountQuestion.name)).toBeInTheDocument();
      expect(screen.queryByText(/items? selected/)).not.toBeInTheDocument();

      const deletedPaths = fetchMock.callHistory
        .calls(undefined, { method: "DELETE" })
        .map((call) => new URL(call.url).pathname);
      expect(deletedPaths.sort()).toEqual([
        `/api/card/${ordersQuestion.id}`,
        `/api/card/${ordersModel.id}`,
      ]);
    });
  });

  describe("archive banner", () => {
    const BANNER_ACTIONS = ["Restore", "Move", "Delete permanently"] as const;

    const createArchivedCollection = (
      permissions: Pick<Collection, "can_write" | "can_restore" | "can_delete">,
    ) =>
      createMockCollection({
        id: 5,
        name: "Archived collection",
        archived: true,
        ...permissions,
      });

    it("should show every action to a user who can curate the collection", async () => {
      await setup({
        collection: createArchivedCollection({
          can_write: true,
          can_restore: true,
          can_delete: true,
        }),
      });

      const banner = await screen.findByTestId("archive-banner");
      BANNER_ACTIONS.forEach((action) => {
        expect(within(banner).getByText(action)).toBeInTheDocument();
      });
    });

    it("should not show restore, move or delete to a user with view-only permissions", async () => {
      await setup({
        collection: createArchivedCollection({
          can_write: false,
          can_restore: false,
          can_delete: false,
        }),
      });

      const banner = await screen.findByTestId("archive-banner");
      expect(
        within(banner).getByText("This collection is in the trash."),
      ).toBeInTheDocument();
      BANNER_ACTIONS.forEach((action) => {
        expect(within(banner).queryByText(action)).not.toBeInTheDocument();
      });
    });

    it.each([
      { permission: "can_restore", action: "Restore" },
      { permission: "can_write", action: "Move" },
      { permission: "can_delete", action: "Delete permanently" },
    ] as const)(
      "should show only $action when only $permission is granted",
      async ({ permission, action }) => {
        await setup({
          collection: createArchivedCollection({
            can_write: false,
            can_restore: false,
            can_delete: false,
            [permission]: true,
          }),
        });

        const banner = await screen.findByTestId("archive-banner");
        expect(within(banner).getByText(action)).toBeInTheDocument();
        BANNER_ACTIONS.filter(
          (bannerAction) => bannerAction !== action,
        ).forEach((bannerAction) => {
          expect(
            within(banner).queryByText(bannerAction),
          ).not.toBeInTheDocument();
        });
      },
    );
  });
});
