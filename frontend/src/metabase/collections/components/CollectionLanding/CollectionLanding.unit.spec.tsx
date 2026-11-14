import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
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
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { modalRoute } from "metabase/common/components/ModalRoute";
import { Route } from "metabase/router";
import type { Collection } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItemFromCollection,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { MoveCollectionModal } from "../MoveCollectionModal";

import CollectionLanding from "./CollectionLanding";

const ADMIN_ID = 1;

const ROOT = createMockCollection({ ...ROOT_COLLECTION, can_write: true });

const PERSONAL_COLLECTION = createMockCollection({
  id: 1,
  name: "Bobby Tables's Personal Collection",
  personal_owner_id: ADMIN_ID,
  is_personal: true,
  location: "/",
  can_write: true,
});

const COLLECTION_IN_PERSONAL = createMockCollection({
  id: 50,
  name: "C30235",
  location: `/${PERSONAL_COLLECTION.id}/`,
  parent_id: PERSONAL_COLLECTION.id,
  is_personal: true,
  can_write: true,
  effective_ancestors: [
    {
      id: PERSONAL_COLLECTION.id,
      name: PERSONAL_COLLECTION.name,
      can_write: true,
      personal_owner_id: ADMIN_ID,
    },
  ],
});

function setupMovableCollectionEndpoints() {
  let storedCollection: Collection = COLLECTION_IN_PERSONAL;

  fetchMock.get(`path:/api/collection/${COLLECTION_IN_PERSONAL.id}`, () => ({
    ...storedCollection,
  }));
  fetchMock.put(
    `path:/api/collection/${COLLECTION_IN_PERSONAL.id}`,
    async (call) => {
      const body: unknown = await new Request(call.url, call.options).json();
      const isMoveToRoot =
        typeof body === "object" &&
        body !== null &&
        "parent_id" in body &&
        body.parent_id === null;
      if (isMoveToRoot) {
        storedCollection = {
          ...storedCollection,
          location: "/",
          parent_id: null,
          is_personal: false,
          effective_ancestors: [],
        };
      }
      return storedCollection;
    },
    { name: "update-collection" },
  );
}

async function setup() {
  mockGetBoundingClientRect();

  setupMovableCollectionEndpoints();
  setupCollectionByIdEndpoint({ collections: [ROOT, PERSONAL_COLLECTION] });
  setupCollectionsEndpoints({
    collections: [PERSONAL_COLLECTION, COLLECTION_IN_PERSONAL],
    rootCollection: ROOT,
    currentUserId: ADMIN_ID,
  });
  setupRootCollectionItemsEndpoint({ rootCollectionItems: [] });
  setupCollectionItemsEndpoint({
    collection: PERSONAL_COLLECTION,
    collectionItems: [
      createMockCollectionItemFromCollection(COLLECTION_IN_PERSONAL),
    ],
  });
  setupCollectionItemsEndpoint({
    collection: COLLECTION_IN_PERSONAL,
    collectionItems: [],
  });
  setupBookmarksEndpoints([]);
  setupDatabasesEndpoints([]);
  setupSearchEndpoints([]);
  setupNullGetUserKeyValueEndpoints();
  setupDashboardQuestionCandidatesEndpoint([]);
  setupUserMetabotPermissionsEndpoint();
  setupRecentViewsAndSelectionsEndpoints([], ["views", "selections"]);
  fetchMock.get("path:/api/timeline", []);

  const storeInitialState = createMockState({
    currentUser: createMockUser({
      id: ADMIN_ID,
      is_superuser: true,
      personal_collection_id: PERSONAL_COLLECTION.id,
    }),
    settings: mockSettings({
      "token-features": createMockTokenFeatures({
        official_collections: true,
      }),
    }),
  });
  setupEnterpriseOnlyPlugin("collections");

  renderWithProviders(
    <Route path="/collection/:slug" element={<CollectionLanding />}>
      {modalRoute("move", MoveCollectionModal)}
    </Route>,
    {
      withRouter: true,
      withDND: true,
      initialRoute: `/collection/${COLLECTION_IN_PERSONAL.id}-c30235`,
      storeInitialState,
    },
  );

  await waitFor(() =>
    expect(screen.getByTestId("collection-name-heading")).toHaveValue(
      COLLECTION_IN_PERSONAL.name,
    ),
  );
}

async function openCollectionMenu() {
  await userEvent.click(
    within(screen.getByTestId("collection-menu")).getByLabelText(
      "ellipsis icon",
    ),
  );
  return screen.findByRole("menu");
}

describe("CollectionLanding", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should allow to make a collection official after moving it from a personal collection to the root collection (metabase#30235)", async () => {
    await setup();

    const menuBeforeMove = await openCollectionMenu();
    expect(
      within(menuBeforeMove).queryByRole("menuitem", {
        name: /Edit permissions/,
      }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(menuBeforeMove).getByRole("menuitem", { name: /Move$/ }),
    );

    const picker = await screen.findByRole("dialog", {
      name: `Move "${COLLECTION_IN_PERSONAL.name}"?`,
    });
    await userEvent.click(await within(picker).findByText("Our analytics"));
    await userEvent.click(within(picker).getByRole("button", { name: "Move" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", {
          name: `Move "${COLLECTION_IN_PERSONAL.name}"?`,
        }),
      ).not.toBeInTheDocument(),
    );
    const moveRequest = fetchMock.callHistory.lastCall("update-collection");
    expect(
      await new Request(moveRequest?.url ?? "", moveRequest?.options).json(),
    ).toMatchObject({ parent_id: null });

    const menuAfterMove = await openCollectionMenu();
    expect(
      await within(menuAfterMove).findByRole("menuitem", {
        name: /Edit permissions/,
      }),
    ).toBeInTheDocument();
    expect(
      within(menuAfterMove).getByRole("menuitem", {
        name: /Make collection official/,
      }),
    ).toBeInTheDocument();
  });
});
