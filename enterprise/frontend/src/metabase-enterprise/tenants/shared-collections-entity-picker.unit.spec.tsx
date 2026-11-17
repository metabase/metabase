import { QueryStatus } from "@reduxjs/toolkit/query";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { createMockMetadata } from "__support__/metadata";
import {
  findRequests,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupCustomVizPluginListEndpoint,
  setupDashboardEndpoints,
  setupDatabasesEndpoints,
  setupLibraryEndpoints,
  setupMostRecentlyViewedDashboard,
  setupRecentViewsAndSelectionsEndpoints,
  setupRootCollectionItemsEndpoint,
  setupSearchEndpoints,
  setupTenantCollectionItemsEndpoint,
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
import { Api } from "metabase/api";
import { MoveCollectionModal } from "metabase/collections/components/MoveCollectionModal";
import { CreateDashboardModal } from "metabase/common/CreateDashboard/CreateDashboardModal";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { AddToDashSelectDashModal } from "metabase/common/components/Pickers/AddToDashSelectDashModal";
import type { SaveQuestionProps } from "metabase/common/components/SaveQuestionForm/types";
import { SaveQuestionModal } from "metabase/common/components/SaveQuestionModal";
import { DashboardMoveModal } from "metabase/dashboard/components/DashboardMoveModal";
import { MoveCardModal } from "metabase/questions/components/MoveCardModal";
import type { State } from "metabase/redux/store";
import { Route } from "metabase/router";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { Card, Collection, CollectionItem } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockSearchResult,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

const TENANT_NAMESPACE = "shared-tenant-collection";
const TENANT_ROOT_NAME = "Shared collections";

const ROOT = createMockCollection({
  ...ROOT_COLLECTION,
  name: "Our analytics",
  can_write: true,
});

const REGULAR_COLLECTION = createMockCollection({
  id: 12,
  name: "First collection",
  location: "/",
  can_write: true,
});

const COLLECTION_TO_MOVE = createMockCollection({
  id: 14,
  name: "Collection To Move",
  location: "/",
  can_write: true,
});

// Listed before the target tenant collection, so a picker that always takes
// the first item would pick this one.
const OTHER_TENANT_COLLECTION = createMockCollection({
  id: 13,
  name: "Another Tenant Collection",
  namespace: TENANT_NAMESPACE,
  location: "/",
  can_write: true,
});

const TENANT_COLLECTION = createMockCollection({
  id: 10,
  name: "Test Tenant Collection",
  namespace: TENANT_NAMESPACE,
  location: "/",
  can_write: true,
});

const TENANT_SUB_COLLECTION = createMockCollection({
  id: 11,
  name: "Tenant Sub-Collection",
  namespace: TENANT_NAMESPACE,
  location: `/${TENANT_COLLECTION.id}/`,
  can_write: true,
});

const COLLECTIONS = [
  REGULAR_COLLECTION,
  COLLECTION_TO_MOVE,
  OTHER_TENANT_COLLECTION,
  TENANT_COLLECTION,
  TENANT_SUB_COLLECTION,
];

const toCollectionItem = (collection: Collection): CollectionItem =>
  createMockCollectionItem({
    id: Number(collection.id),
    name: collection.name,
    model: "collection",
    location: collection.location ?? "/",
    namespace: collection.namespace,
    can_write: true,
    here: ["collection"],
    below: ["collection", "card", "dashboard"],
  });

interface SetupEnvironmentOpts {
  useTenants?: boolean;
}

function setupEnvironment({ useTenants = true }: SetupEnvironmentOpts = {}) {
  mockGetBoundingClientRect();
  setupRecentViewsAndSelectionsEndpoints([]);
  setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
  setupDatabasesEndpoints([]);
  setupLibraryEndpoints();
  setupCustomVizPluginListEndpoint();
  setupMostRecentlyViewedDashboard();
  setupCollectionsEndpoints({ collections: COLLECTIONS, rootCollection: ROOT });
  setupCollectionByIdEndpoint({ collections: [ROOT, ...COLLECTIONS] });
  setupRootCollectionItemsEndpoint({
    rootCollectionItems: [
      toCollectionItem(REGULAR_COLLECTION),
      toCollectionItem(COLLECTION_TO_MOVE),
    ],
    tenantRootItems: [
      toCollectionItem(OTHER_TENANT_COLLECTION),
      toCollectionItem(TENANT_COLLECTION),
    ],
  });
  setupTenantCollectionItemsEndpoint({
    collection: TENANT_COLLECTION,
    collectionItems: [toCollectionItem(TENANT_SUB_COLLECTION)],
  });
  setupTenantCollectionItemsEndpoint({
    collection: TENANT_SUB_COLLECTION,
    collectionItems: [],
  });
  setupTenantCollectionItemsEndpoint({
    collection: OTHER_TENANT_COLLECTION,
    collectionItems: [],
  });
  setupCollectionItemsEndpoint({
    collection: REGULAR_COLLECTION,
    collectionItems: [],
  });
  setupCollectionItemsEndpoint({
    collection: COLLECTION_TO_MOVE,
    collectionItems: [],
  });
  // The search endpoint mock only returns the items whose name matches `q`.
  setupSearchEndpoints([
    createMockSearchResult({
      id: Number(TENANT_COLLECTION.id),
      name: TENANT_COLLECTION.name,
      model: "collection",
      collection: ROOT,
    }),
    createMockSearchResult({
      id: Number(REGULAR_COLLECTION.id),
      name: REGULAR_COLLECTION.name,
      model: "collection",
      collection: ROOT,
    }),
  ]);
  fetchMock.get("path:/api/user/recipients", { data: [] });

  // `mockSettings` sets the token features that the plugin reads when it
  // initializes, so it has to run first.
  const storeInitialState = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    settings: mockSettings({
      "use-tenants": useTenants,
      "token-features": createMockTokenFeatures({ tenants: true }),
    }),
  });
  setupEnterpriseOnlyPlugin("tenants");

  return { storeInitialState };
}

const findPicker = () => screen.findByTestId("entity-picker-modal");

const clickItem = async (picker: HTMLElement, name: string) =>
  userEvent.click(await within(picker).findByText(name));

// Waits for the tenant root to load, so that a disabled button is not just a
// loading state.
const openTenantRoot = async (picker: HTMLElement) => {
  await clickItem(picker, TENANT_ROOT_NAME);
  expect(
    await within(picker).findByText(TENANT_COLLECTION.name),
  ).toBeInTheDocument();
};

// The confirm button stays disabled while the picker loads the picked item,
// so wait for the expected state instead of reading it once.
const expectButtonEnabled = (picker: HTMLElement, name: string) =>
  waitFor(() =>
    expect(within(picker).getByRole("button", { name })).toBeEnabled(),
  );

const expectButtonDisabled = (picker: HTMLElement, name: string) =>
  waitFor(() =>
    expect(within(picker).getByRole("button", { name })).toBeDisabled(),
  );

// The move invalidates the collection items, so the open picker lists refetch.
// Wait for them, so that they don't update the picker after the test ends.
const waitForRefetches = (store: { getState: () => State }) =>
  waitFor(() =>
    expect(
      Object.values(store.getState()[Api.reducerPath].queries).filter(
        (query) => query?.status === QueryStatus.pending,
      ),
    ).toEqual([]),
  );

const findRequestsTo = async (method: "PUT" | "POST", path: string) =>
  (await findRequests(method)).filter(
    ({ url }) => new URL(url).pathname === path,
  );

const searchFor = async (picker: HTMLElement, searchText: string) => {
  await userEvent.type(
    await within(picker).findByPlaceholderText(/Search/),
    searchText,
  );
  expect(
    await within(picker).findByText(`Search results for "${searchText}"`),
  ).toBeInTheDocument();
};

const getLastSearchParams = () =>
  new URL(String(fetchMock.callHistory.lastCall("path:/api/search")?.url))
    .searchParams;

describe("entity picker > shared tenant collections", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("moving a question", () => {
    // Starts outside the root collection: the tenant root also has the id
    // "root", so a question in Our analytics can't be moved there anyway.
    const card = createMockCard({
      id: 1,
      name: "Orders",
      collection_id: Number(REGULAR_COLLECTION.id),
      collection: REGULAR_COLLECTION,
    });

    // Like the e2e question, so the search scope is "Everywhere".
    const cardInRoot = createMockCard({
      id: 2,
      name: "Orders in Our analytics",
      collection_id: null,
    });

    interface SetupOpts extends SetupEnvironmentOpts {
      cardToMove?: Card;
    }

    const setup = ({ cardToMove = card, ...opts }: SetupOpts = {}) => {
      const { storeInitialState } = setupEnvironment(opts);
      fetchMock.put(`path:/api/card/${cardToMove.id}`, (call) => ({
        ...cardToMove,
        ...JSON.parse(String(call.options.body)),
      }));
      const onClose = jest.fn();
      const { store } = renderWithProviders(
        <MoveCardModal card={cardToMove} onClose={onClose} />,
        { storeInitialState },
      );
      return { onClose, store };
    };

    it("should show Shared collections when tenants are enabled and open its sub-collections", async () => {
      setup();
      const picker = await findPicker();

      expect(await within(picker).findByText("Our analytics")).toBeVisible();
      expect(within(picker).getByText(TENANT_ROOT_NAME)).toBeVisible();

      await clickItem(picker, TENANT_ROOT_NAME);
      expect(
        await within(picker).findByText(TENANT_COLLECTION.name),
      ).toBeVisible();
      expect(
        within(picker).getByText(OTHER_TENANT_COLLECTION.name),
      ).toBeVisible();
    });

    it("should not show Shared collections when tenants are disabled", async () => {
      setup({ useTenants: false });
      const picker = await findPicker();

      // The root items are computed together, so they are final once one shows.
      expect(await within(picker).findByText("Our analytics")).toBeVisible();
      expect(
        await within(picker).findByText(REGULAR_COLLECTION.name),
      ).toBeVisible();
      expect(
        within(picker).queryByText(TENANT_ROOT_NAME),
      ).not.toBeInTheDocument();
    });

    it("should not allow moving to the tenant root, but should allow moving to a tenant collection", async () => {
      const { onClose, store } = setup();
      const picker = await findPicker();

      await openTenantRoot(picker);
      await expectButtonDisabled(picker, "Move");

      await clickItem(picker, TENANT_COLLECTION.name);
      await expectButtonEnabled(picker, "Move");
      await userEvent.click(
        within(picker).getByRole("button", { name: "Move" }),
      );

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      await waitForRefetches(store);
      const puts = await findRequestsTo("PUT", `/api/card/${card.id}`);
      expect(puts).toHaveLength(1);
      expect(puts[0].body).toMatchObject({
        collection_id: TENANT_COLLECTION.id,
        dashboard_id: null,
      });
    });

    it("should find tenant collections via search", async () => {
      setup({ cardToMove: cardInRoot });
      const picker = await findPicker();

      await searchFor(picker, TENANT_COLLECTION.name);

      expect(
        await within(picker).findByText(TENANT_COLLECTION.name),
      ).toBeVisible();
      expect(getLastSearchParams().get("q")).toBe(TENANT_COLLECTION.name);
      expect(getLastSearchParams().getAll("models")).toEqual([
        "collection",
        "dashboard",
      ]);
    });
  });

  describe("moving a dashboard", () => {
    // Starts outside the root collection, see "moving a question".
    const dashboard = createMockDashboard({
      id: 5,
      name: "Dashboard to Move",
      collection_id: Number(REGULAR_COLLECTION.id),
      collection: REGULAR_COLLECTION,
    });

    it("should not allow moving to the tenant root, but should allow moving to a tenant collection", async () => {
      const { storeInitialState } = setupEnvironment();
      setupDashboardEndpoints(dashboard);
      const onClose = jest.fn();
      const { store } = renderWithProviders(
        <DashboardMoveModal dashboard={dashboard} onClose={onClose} />,
        { storeInitialState },
      );
      const picker = await findPicker();

      await openTenantRoot(picker);
      await expectButtonDisabled(picker, "Move");

      await clickItem(picker, TENANT_COLLECTION.name);
      await expectButtonEnabled(picker, "Move");
      await userEvent.click(
        within(picker).getByRole("button", { name: "Move" }),
      );

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      await waitForRefetches(store);
      const puts = await findRequestsTo(
        "PUT",
        `/api/dashboard/${dashboard.id}`,
      );
      expect(puts).toHaveLength(1);
      expect(puts[0].body).toMatchObject({
        collection_id: TENANT_COLLECTION.id,
      });
    });
  });

  describe("moving a collection", () => {
    interface SetupOpts {
      collection: Collection;
    }

    const setup = ({ collection }: SetupOpts) => {
      const { storeInitialState } = setupEnvironment();
      const onClose = jest.fn();
      renderWithProviders(
        <MoveCollectionModal collectionId={collection.id} onClose={onClose} />,
        { storeInitialState },
      );
      return { onClose };
    };

    it("should not offer the tenant root when moving a regular collection", async () => {
      const { onClose } = setup({ collection: COLLECTION_TO_MOVE });
      const picker = await findPicker();

      expect(await within(picker).findByText("Our analytics")).toBeVisible();
      expect(
        await within(picker).findByText(REGULAR_COLLECTION.name),
      ).toBeVisible();
      expect(
        within(picker).queryByText(TENANT_ROOT_NAME),
      ).not.toBeInTheDocument();

      await userEvent.click(
        within(picker).getByRole("button", { name: "Cancel" }),
      );

      expect(
        await findRequestsTo("PUT", `/api/collection/${COLLECTION_TO_MOVE.id}`),
      ).toHaveLength(0);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("should offer the tenant root when moving a tenant collection with the same setup", async () => {
      setup({ collection: TENANT_SUB_COLLECTION });
      const picker = await findPicker();

      expect(await within(picker).findByText(TENANT_ROOT_NAME)).toBeVisible();
      expect(
        within(picker).queryByText("Our analytics"),
      ).not.toBeInTheDocument();
    });

    it("should find regular collections via search", async () => {
      setup({ collection: COLLECTION_TO_MOVE });
      const picker = await findPicker();

      await searchFor(picker, REGULAR_COLLECTION.name);

      expect(
        await within(picker).findByText(REGULAR_COLLECTION.name),
      ).toBeVisible();
      expect(getLastSearchParams().get("q")).toBe(REGULAR_COLLECTION.name);
      expect(getLastSearchParams().getAll("models")).toEqual(["collection"]);
    });
  });

  describe("saving a new dashboard", () => {
    it("should not allow the tenant root, but should create the dashboard in a tenant collection", async () => {
      const { storeInitialState } = setupEnvironment();
      fetchMock.post("path:/api/dashboard", (call) =>
        createMockDashboard({
          id: 42,
          ...JSON.parse(String(call.options.body)),
        }),
      );
      const { router } = renderWithProviders(
        <Route
          path="*"
          element={<CreateDashboardModal opened onClose={jest.fn()} />}
        />,
        { storeInitialState, withRouter: true },
      );

      await userEvent.click(await screen.findByLabelText(/Which collection/));
      const picker = await findPicker();

      await openTenantRoot(picker);
      await expectButtonDisabled(picker, "Select");

      await clickItem(picker, TENANT_COLLECTION.name);
      await expectButtonEnabled(picker, "Select");
      await userEvent.click(
        within(picker).getByRole("button", { name: "Select" }),
      );

      await waitFor(() =>
        expect(screen.getByLabelText(/Which collection/)).toHaveTextContent(
          TENANT_COLLECTION.name,
        ),
      );
      await userEvent.type(
        screen.getByLabelText("Name"),
        "Dashboard in Tenant Collection",
      );
      await userEvent.click(screen.getByRole("button", { name: "Create" }));

      await waitFor(() =>
        expect(router?.location.pathname).toMatch(/^\/dashboard\/42/),
      );
      const posts = await findRequestsTo("POST", "/api/dashboard");
      expect(posts).toHaveLength(1);
      expect(posts[0].body).toMatchObject({
        name: "Dashboard in Tenant Collection",
        collection_id: TENANT_COLLECTION.id,
      });
    });
  });

  describe("saving a new question", () => {
    const metadata = createMockMetadata({
      databases: [createSampleDatabase()],
    });

    const question = new Question(
      {
        display: "table",
        visualization_settings: {},
        type: "question",
        dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
          stages: [{ source: { type: "table", id: ORDERS_ID } }],
        }),
      },
      metadata,
    );

    it("should not allow the tenant root, but should save the question to a tenant collection", async () => {
      const { storeInitialState } = setupEnvironment();
      const onCreate = jest.fn<
        ReturnType<SaveQuestionProps["onCreate"]>,
        Parameters<SaveQuestionProps["onCreate"]>
      >((question) => Promise.resolve(question));
      renderWithProviders(
        <SaveQuestionModal
          question={question}
          originalQuestion={null}
          onCreate={onCreate}
          onSave={jest.fn()}
          onClose={jest.fn()}
          opened
        />,
        { storeInitialState },
      );

      await userEvent.click(
        await screen.findByLabelText(/Where do you want to save this/),
      );
      const picker = await findPicker();

      await openTenantRoot(picker);
      await expectButtonDisabled(picker, "Select this collection");

      await clickItem(picker, TENANT_COLLECTION.name);
      await expectButtonEnabled(picker, "Select this collection");
      await userEvent.click(
        within(picker).getByRole("button", { name: "Select this collection" }),
      );

      await waitFor(() =>
        expect(
          screen.getByLabelText(/Where do you want to save this/),
        ).toHaveTextContent(TENANT_COLLECTION.name),
      );
      const nameInput = screen.getByLabelText("Name");
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, "Question in Tenant Collection");
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
      const [savedQuestion] = onCreate.mock.calls[0];
      expect(savedQuestion.displayName()).toBe("Question in Tenant Collection");
      expect(savedQuestion.collectionId()).toBe(TENANT_COLLECTION.id);
    });
  });

  describe("adding a question to a dashboard", () => {
    it("should not allow a new dashboard in the tenant root, but should allow it in a tenant collection", async () => {
      const { storeInitialState } = setupEnvironment();
      const card = createMockCard({ id: 1, collection_id: null });
      renderWithProviders(
        <Route
          path="*"
          element={
            <AddToDashSelectDashModal
              card={card}
              onChangeLocation={jest.fn()}
              onClose={jest.fn()}
            />
          }
        />,
        { storeInitialState, withRouter: true },
      );
      const picker = await findPicker();

      await openTenantRoot(picker);
      await expectButtonDisabled(picker, "New dashboard");

      await clickItem(picker, TENANT_COLLECTION.name);
      await expectButtonEnabled(picker, "New dashboard");
    });
  });
});
