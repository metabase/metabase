import userEvent from "@testing-library/user-event";

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
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, within } from "__support__/ui";
import { Route } from "metabase/router";
import type { Collection, CollectionItem } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockUser,
} from "metabase-types/api/mocks";

import { CollectionContent } from "./CollectionContent";

const ADMIN = createMockUser({
  id: 1,
  is_superuser: true,
  personal_collection_id: 10,
});
const OTHER_USER_ID = 2;

const ADMIN_PERSONAL_COLLECTION = createMockCollection({
  id: 10,
  name: "Bobby Tables's Personal Collection",
  personal_owner_id: ADMIN.id,
  is_personal: true,
  can_write: true,
});

const PERSONAL_SUBCOLLECTION = createMockCollection({
  id: 11,
  name: "Foo",
  location: `/${ADMIN_PERSONAL_COLLECTION.id}/`,
  is_personal: true,
  can_write: true,
});

const OTHER_USER_PERSONAL_COLLECTION = createMockCollection({
  id: 20,
  name: "No Data Tableton's Personal Collection",
  personal_owner_id: OTHER_USER_ID,
  is_personal: true,
  can_write: true,
});

const SHARED_COLLECTION = createMockCollection({
  id: 30,
  name: "Shared collection",
  can_write: true,
});

const COLLECTIONS = [
  ADMIN_PERSONAL_COLLECTION,
  PERSONAL_SUBCOLLECTION,
  OTHER_USER_PERSONAL_COLLECTION,
  SHARED_COLLECTION,
];

const OTHER_USER_PERSONAL_ITEMS = [
  createMockCollectionItem({
    id: 21,
    name: "Another sub-collection",
    model: "collection",
  }),
  createMockCollectionItem({
    id: 22,
    name: "Nodata sub-collection",
    model: "collection",
  }),
];

type SetupOpts = {
  collection: Collection;
  collectionItems?: CollectionItem[];
};

async function setup({ collection, collectionItems = [] }: SetupOpts) {
  setupCollectionByIdEndpoint({ collections: COLLECTIONS });
  setupCollectionsEndpoints({ collections: COLLECTIONS });
  COLLECTIONS.forEach((item) =>
    setupCollectionItemsEndpoint({
      collection: item,
      collectionItems: item.id === collection.id ? collectionItems : [],
    }),
  );
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
      storeInitialState: createMockState({ currentUser: ADMIN }),
      withRouter: true,
      withDND: true,
    },
  );

  await screen.findByDisplayValue(collection.name);
}

const getCollectionActions = () =>
  within(screen.getByTestId("collection-menu"));

describe("CollectionContent personal collections (admin)", () => {
  it.each([
    ["their own", ADMIN_PERSONAL_COLLECTION],
    ["another user's", OTHER_USER_PERSONAL_COLLECTION],
  ])(
    "shows info but no collection menu for %s personal collection (metabase#8406)",
    async (_, collection) => {
      await setup({ collection });

      expect(
        getCollectionActions().getByLabelText("info icon"),
      ).toBeInTheDocument();
      expect(
        getCollectionActions().queryByLabelText("ellipsis icon"),
      ).not.toBeInTheDocument();
    },
  );

  it("lets an admin rename and trash a personal sub-collection, but not edit its permissions", async () => {
    await setup({ collection: PERSONAL_SUBCOLLECTION });

    expect(screen.getByDisplayValue("Foo")).toBeEnabled();

    await userEvent.click(
      getCollectionActions().getByLabelText("ellipsis icon"),
    );
    const menu = within(await screen.findByRole("menu"));
    expect(menu.getByText("Move to trash")).toBeVisible();
    expect(menu.queryByText("Edit permissions")).not.toBeInTheDocument();
  });

  it("lets an admin edit permissions of a collection outside personal collections", async () => {
    await setup({ collection: SHARED_COLLECTION });

    await userEvent.click(
      getCollectionActions().getByLabelText("ellipsis icon"),
    );
    const menu = within(await screen.findByRole("menu"));
    expect(menu.getByText("Move to trash")).toBeVisible();
    expect(menu.getByText("Edit permissions")).toBeInTheDocument();
  });

  it("shows the sub-collections of another user's personal collection (metabase#15339)", async () => {
    await setup({
      collection: OTHER_USER_PERSONAL_COLLECTION,
      collectionItems: OTHER_USER_PERSONAL_ITEMS,
    });

    const table = within(await screen.findByTestId("collection-table"));
    expect(await table.findByText("Nodata sub-collection")).toBeInTheDocument();
  });
});
