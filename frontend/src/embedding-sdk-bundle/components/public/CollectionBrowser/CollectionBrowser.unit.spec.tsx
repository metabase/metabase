import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import type { ComponentProps } from "react";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupRootCollectionItemsEndpoint,
} from "__support__/server-mocks";
import { screen, waitFor, within } from "__support__/ui";
import {
  CollectionBrowser,
  CollectionBrowserInner,
} from "embedding-sdk-bundle/components/public/CollectionBrowser/CollectionBrowser";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { useLocale } from "metabase/common/hooks/use-locale";
import { reinitialize as reinitializePlugins } from "metabase/plugins";
import { defer } from "metabase/utils/promise";
import type {
  Collection,
  CollectionItem,
  TokenFeatures,
  User,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockSettings,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockEntityId } from "metabase-types/api/mocks/entity-id";

jest.mock("metabase/common/hooks/use-locale", () => ({
  useLocale: jest.fn(),
}));

// Unjustified type cast. FIXME
const useLocaleMock = useLocale as jest.Mock;

const ROOT_TEST_COLLECTION = createMockCollection({
  ...ROOT_COLLECTION,
  can_write: false,
  effective_ancestors: [],
  id: "root",
});

const PERSONAL_COLLECTION_ID = 1;

const BOBBY_TEST_COLLECTION = createMockCollection({
  archived: false,
  can_write: true,
  description: null,
  id: PERSONAL_COLLECTION_ID,
  location: "/",
  name: "Bobby Tables's Personal Collection",
  personal_owner_id: 100,
  is_personal: true,
  effective_ancestors: [ROOT_TEST_COLLECTION],
});

const TEST_COLLECTIONS = [ROOT_TEST_COLLECTION, BOBBY_TEST_COLLECTION];

const NESTED_COLLECTION_ID = 2;
const NESTED_COLLECTION_NAME = "Nested Collection";

const TENANT_COLLECTION_ID = 777;

const TENANT_USER = createMockUser({
  tenant_collection_id: TENANT_COLLECTION_ID,
});

const SHARED_REPORTS_ID = 11;
const SHARED_REPORTS_ENTITY_ID = createMockEntityId("sharedEntityId1234567");

const SHARED_TENANT_COLLECTIONS = [
  createMockCollection({
    id: SHARED_REPORTS_ID,
    name: "Shared reports",
    namespace: "shared-tenant-collection",
    entity_id: SHARED_REPORTS_ENTITY_ID,
  }),
  createMockCollection({
    id: 12,
    name: "Shared metrics",
    namespace: "shared-tenant-collection",
  }),
];

const TENANT_TOKEN_FEATURES: Partial<TokenFeatures> = {
  embedding_sdk: true,
  tenants: true,
};

// The promoted rows of a root 403. The API drops root from `effective_ancestors`
// when the user cannot read it, so the fixture drops it too.
const PROMOTED_COLLECTION_ID = 42;

const PROMOTED_TEST_COLLECTION = createMockCollection({
  id: PROMOTED_COLLECTION_ID,
  name: "Promoted Collection",
  location: "/",
  effective_ancestors: [],
});

const USER_WITHOUT_PERSONAL_COLLECTION = createMockUser({
  personal_collection_id: null,
});

describe("CollectionBrowser", () => {
  it("should render a loader when a locale is loading", async () => {
    useLocaleMock.mockReturnValue({ isLocaleLoading: true });
    const state = setupSdkState();

    renderWithSDKProviders(<CollectionBrowser collectionId="root" />, {
      componentProviderProps: {
        authConfig: createMockSdkConfig(),
      },
      storeInitialState: state,
    });

    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
  });

  it("should render", async () => {
    await setup();

    await waitFor(() => {
      expect(screen.getByText("Type")).toBeInTheDocument();
    });

    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Last edited by")).toBeInTheDocument();
    expect(screen.getByText("Last edited at")).toBeInTheDocument();
  });

  it("renders the empty table without requesting an undefined collection when the user has no personal collection", async () => {
    // An API-key user (the data-app dev preview) never has a personal
    // collection, so "personal" resolves to nothing. The browser must render
    // its empty state, not request `/api/collection/undefined(/items)`.
    useLocaleMock.mockReturnValue({ isLocaleLoading: false });
    setupCollectionsEndpoints({
      collections: TEST_COLLECTIONS,
      rootCollection: ROOT_TEST_COLLECTION,
    });

    renderWithSDKProviders(<CollectionBrowserInner collectionId="personal" />, {
      componentProviderProps: { authConfig: createMockSdkConfig() },
      storeInitialState: setupSdkState({
        currentUser: USER_WITHOUT_PERSONAL_COLLECTION,
      }),
    });

    // The empty state renders, rather than nothing.
    expect(
      await screen.findByTestId("collection-empty-state"),
    ).toBeInTheDocument();

    expect(
      fetchMock.callHistory.calls("glob:*/api/collection/undefined*"),
    ).toHaveLength(0);
  });

  it("should allow to hide certain columns", async () => {
    await setup({
      props: {
        visibleColumns: ["type", "name"],
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("items-table-head")).toBeInTheDocument();
    });

    expect(getColumnNames()).toStrictEqual(["Type", "Name"]);
  });

  it("should NOT include description column by default", async () => {
    await setup();

    await waitFor(() => {
      expect(screen.getByTestId("items-table-head")).toBeInTheDocument();
    });

    expect(getColumnNames()).not.toContain("Description");
  });

  it("should show description column when explicitly included", async () => {
    await setup({
      props: {
        visibleColumns: ["type", "name", "description"],
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("items-table-head")).toBeInTheDocument();
    });

    expect(getColumnNames()).toStrictEqual(["Type", "Name", "Description"]);
  });

  it("should hide dashboard questions by default", async () => {
    await setup();

    expect(getLastItemsRequestParam("show_dashboard_questions")).toBe("false");
  });

  it("should show dashboard questions when showDashboardQuestions is true", async () => {
    await setup({ props: { showDashboardQuestions: true } });

    expect(getLastItemsRequestParam("show_dashboard_questions")).toBe("true");
  });

  it("should resolve collectionId=tenant to user's tenant collection", async () => {
    const tenantCollection = createMockCollection({
      id: 999,
      name: "Tenant Collection: Acme Inc",
      archived: false,
      can_write: true,
      description: null,
      location: "/",
    });

    const dashboardItem = createMockCollectionItem({
      id: 4,
      name: "Acme Dashboard",
      model: "dashboard",
    });

    await setup({
      props: { collectionId: "tenant" },
      collections: [tenantCollection],
      rootCollection: tenantCollection,
      currentUser: createMockUser({
        tenant_collection_id: tenantCollection.id,
      }),
      collectionItems: [dashboardItem],
    });

    expect(await screen.findByText(tenantCollection.name)).toBeInTheDocument();
    expect(await screen.findByText(dashboardItem.name)).toBeInTheDocument();
  });

  describe('collectionId="all"', () => {
    beforeEach(() => {
      reinitializePlugins();
    });

    // GET /api/collection/root has three outcomes and each one leads somewhere
    // different. Only a 403 means "you cannot read the root itself, but you can
    // read what is inside it".
    describe("/api/collection/root", () => {
      it('should show the "Our analytics" row when the root is readable', async () => {
        await setupAll();

        expect(await screen.findByText("Our analytics")).toBeInTheDocument();
        expect(
          fetchMock.callHistory.calls("path:/api/collection/root/items"),
        ).toHaveLength(0);
      });

      it("should show the collections inside the root when the root is forbidden", async () => {
        await setupAll({
          rootReadable: false,
          rootCollectionItems: [
            createMockCollectionItem({
              id: PROMOTED_COLLECTION_ID,
              model: "collection",
              name: PROMOTED_TEST_COLLECTION.name,
            }),
          ],
        });

        expect(
          await screen.findByText("Promoted Collection"),
        ).toBeInTheDocument();
        expect(screen.queryByText("Our analytics")).not.toBeInTheDocument();
        expect(
          screen.queryByTestId("sdk-error-container"),
        ).not.toBeInTheDocument();
      });

      it("should show an error when the root fails for any other reason", async () => {
        await setupAll({
          rootReadable: false,
          rootErrorStatus: 500,
          waitForList: false,
        });

        expect(
          await screen.findByText("Failed to load collections"),
        ).toBeInTheDocument();
        expect(
          fetchMock.callHistory.calls("path:/api/collection/root/items"),
        ).toHaveLength(0);
      });
    });

    describe("should show an error when", () => {
      it("the promoted items fail after a root 403", async () => {
        await setupAll({
          rootReadable: false,
          rootItemsErrorStatus: 500,
          waitForList: false,
        });

        expect(
          await screen.findByText("Failed to load collections"),
        ).toBeInTheDocument();
        expect(
          screen.queryByTestId("all-collections-list"),
        ).not.toBeInTheDocument();
      });

      it("the shared tenant tree fails", async () => {
        // Registered first, so it wins over the route setupAll adds.
        fetchMock.get("path:/api/collection/tree", { status: 500, body: "" });

        await setupAll({
          currentUser: TENANT_USER,
          tokenFeatures: TENANT_TOKEN_FEATURES,
          hasTenantsPlugin: true,
          useTenants: true,
          waitForList: false,
        });

        expect(
          await screen.findByText("Failed to load collections"),
        ).toBeInTheDocument();
        expect(
          screen.queryByTestId("all-collections-list"),
        ).not.toBeInTheDocument();
      });

      it("one request fails while another is still in flight", async () => {
        // The loader must not outlive the error, or a dead screen waits on the
        // request that never comes back.
        const tree = defer<Collection[]>();
        fetchMock.get("path:/api/collection/tree", () => tree.promise);

        await setupAll({
          rootReadable: false,
          rootErrorStatus: 500,
          tokenFeatures: TENANT_TOKEN_FEATURES,
          hasTenantsPlugin: true,
          useTenants: true,
          waitForList: false,
        });

        try {
          expect(
            await screen.findByText("Failed to load collections"),
          ).toBeInTheDocument();
          expect(
            screen.queryByTestId("loading-indicator"),
          ).not.toBeInTheDocument();
        } finally {
          tree.resolve([]);
        }
      });
    });

    // RTK re-runs a rejected query when something subscribes to it again, and
    // coming back to the virtual root does exactly that. The rows are all known
    // already, so the list must stay put instead of blinking out for the refetch.
    it("should not show a loader when the user navigates into a collection and back to the virtual root", async () => {
      const secondRootCall = defer<{ status: number; body: string }>();
      let rootCalls = 0;

      fetchMock.get("path:/api/collection/root", () => {
        rootCalls += 1;
        return rootCalls === 1
          ? { status: 403, body: "" }
          : secondRootCall.promise;
      });

      await setupAll({
        rootReadable: false,
        rootCollectionItems: [
          createMockCollectionItem({
            id: PROMOTED_COLLECTION_ID,
            model: "collection",
            name: PROMOTED_TEST_COLLECTION.name,
          }),
        ],
      });

      await userEvent.click(await screen.findByText("Promoted Collection"));
      expect(await screen.findByTestId("collection-table")).toBeInTheDocument();

      try {
        await userEvent.click(screen.getByText("All collections"));

        expect(screen.getByTestId("all-collections-list")).toBeInTheDocument();
        expect(
          screen.queryByTestId("loading-indicator"),
        ).not.toBeInTheDocument();
      } finally {
        secondRootCall.resolve({ status: 403, body: "" });
      }
    });

    describe("table shape and callbacks", () => {
      it("should only show the type and name columns", async () => {
        // Synthesized rows have no edit info, so those columns are dropped.
        await setupAll();

        expect(getColumnNames()).toStrictEqual(["Type", "Name"]);
      });

      it("should pass the whole item to onClick", async () => {
        // `onClick` is a public prop, so the host page receives this item. An
        // item rebuilt from a few fields drops `namespace`, `authority_level`
        // and `entity_id` without anything going red.
        const onClick = jest.fn();

        await setupAll({
          currentUser: TENANT_USER,
          tokenFeatures: TENANT_TOKEN_FEATURES,
          hasTenantsPlugin: true,
          useTenants: true,
          sharedTenantCollections: SHARED_TENANT_COLLECTIONS,
          props: { onClick },
        });

        await userEvent.click(await screen.findByText("Shared reports"));

        expect(onClick).toHaveBeenCalledWith(
          expect.objectContaining({
            ...SHARED_TENANT_COLLECTIONS[0],
            model: "collection",
          }),
        );
      });

      it('should map the "Our analytics" placeholder id back to the real root id', async () => {
        // Every collection has a numeric id, except the root, whose id is the
        // string "root". `ItemsTable` needs a number, so that row carries a
        // placeholder. Skip the conversion back and both the host page and the
        // request get an id that is not a collection.
        const onClick = jest.fn();

        await setupAll({ props: { onClick } });

        await userEvent.click(await screen.findByText("Our analytics"));

        expect(onClick).toHaveBeenCalledWith(
          expect.objectContaining({ id: ROOT_COLLECTION.id }),
        );
        expect(
          await screen.findByTestId("collection-table"),
        ).toBeInTheDocument();
        expect(
          fetchMock.callHistory.calls("path:/api/collection/root/items"),
        ).not.toHaveLength(0);
      });
    });

    it("should page the virtual root and reset the page on the way back", async () => {
      await setupAll({
        rootReadable: false, // to force showing more collections
        rootCollectionItems: [
          createMockCollectionItem({
            id: 101,
            model: "collection",
            name: "Collection A",
          }),
          createMockCollectionItem({
            id: 102,
            model: "collection",
            name: "Collection B",
          }),
          createMockCollectionItem({
            id: PROMOTED_COLLECTION_ID,
            model: "collection",
            name: PROMOTED_TEST_COLLECTION.name,
          }),
        ],
        props: { pageSize: 2 },
      });

      expect(screen.getByText("Collection A")).toBeInTheDocument();
      expect(screen.getByText("Collection B")).toBeInTheDocument();
      expect(
        screen.queryByText(PROMOTED_TEST_COLLECTION.name),
      ).not.toBeInTheDocument();

      await userEvent.click(screen.getByLabelText("Next page"));

      expect(
        screen.getByText(PROMOTED_TEST_COLLECTION.name),
      ).toBeInTheDocument();
      expect(screen.queryByText("Collection A")).not.toBeInTheDocument();

      await userEvent.click(screen.getByText(PROMOTED_TEST_COLLECTION.name));
      expect(await screen.findByText("Promoted Dashboard")).toBeInTheDocument();

      await userEvent.click(screen.getByText("All collections"));

      expect(await screen.findByText("Collection A")).toBeInTheDocument();
    });
  });
});

function getColumnNames(): (string | null)[] {
  return within(screen.getByTestId("items-table-head"))
    .getAllByRole("button")
    .map((header) => header.textContent);
}

function getLastItemsRequestParam(param: string): string | null {
  const calls = fetchMock.callHistory.calls("path:/api/collection/root/items");
  const lastCall = calls[calls.length - 1];
  return new URL(lastCall.url).searchParams.get(param);
}

async function setup({
  props,
  collections = TEST_COLLECTIONS,
  rootCollection = ROOT_TEST_COLLECTION,
  currentUser,
  collectionItems = [
    createMockCollectionItem({ id: 2, model: "dashboard" }),
    createMockCollectionItem({ id: 3, model: "card" }),
  ],
}: {
  props?: Partial<ComponentProps<typeof CollectionBrowserInner>>;
  collections?: Collection[];
  rootCollection?: Collection;
  currentUser?: User;
  collectionItems?: CollectionItem[];
} = {}) {
  useLocaleMock.mockReturnValue({ isLocaleLoading: false });

  setupCollectionsEndpoints({
    collections,
    rootCollection,
  });

  // Mock individual collection endpoint if it has a numeric ID
  if (typeof rootCollection.id === "number") {
    fetchMock.get(`path:/api/collection/${rootCollection.id}`, rootCollection);
  }

  setupCollectionItemsEndpoint({
    collection: rootCollection,
    collectionItems,
  });

  const state = setupSdkState(currentUser ? { currentUser } : {});

  renderWithSDKProviders(
    <CollectionBrowserInner collectionId="root" {...props} />,
    {
      componentProviderProps: {
        authConfig: createMockSdkConfig(),
      },
      storeInitialState: state,
    },
  );

  expect(await screen.findByTestId("collection-table")).toBeInTheDocument();

  await waitFor(() => {
    expect(
      fetchMock.callHistory.calls(
        `path:/api/collection/${rootCollection.id}/items`,
      ),
    ).toHaveLength(1);
  });
}

type SetupAllOptions = {
  rootReadable?: boolean;
  rootErrorStatus?: number;
  rootCollectionItems?: CollectionItem[];
  rootItemsErrorStatus?: number;
  currentUser?: User;
  tokenFeatures?: Partial<TokenFeatures>;
  hasTenantsPlugin?: boolean;
  useTenants?: boolean;
  sharedTenantCollections?: Collection[];
  waitForList?: boolean;
  props?: Partial<ComponentProps<typeof CollectionBrowserInner>>;
};

async function setupAll({
  rootReadable = true,
  rootErrorStatus = 403,
  rootCollectionItems = [],
  rootItemsErrorStatus,
  currentUser,
  tokenFeatures,
  hasTenantsPlugin = false,
  useTenants = false,
  sharedTenantCollections = [],
  waitForList = true,
  props,
}: SetupAllOptions = {}) {
  useLocaleMock.mockReturnValue({ isLocaleLoading: false });

  const drillableCollections = [
    ...TEST_COLLECTIONS,
    PROMOTED_TEST_COLLECTION,
    ...sharedTenantCollections,
  ];

  if (rootReadable) {
    setupCollectionsEndpoints({
      collections: sharedTenantCollections,
      rootCollection: ROOT_TEST_COLLECTION,
    });
    setupCollectionItemsEndpoint({
      collection: ROOT_TEST_COLLECTION,
      collectionItems: [
        createMockCollectionItem({
          id: NESTED_COLLECTION_ID,
          model: "collection",
          name: NESTED_COLLECTION_NAME,
        }),
      ],
    });
  } else {
    fetchMock.get("path:/api/collection/root", {
      status: rootErrorStatus,
      body: "",
    });

    if (rootItemsErrorStatus != null) {
      fetchMock.get("path:/api/collection/root/items", {
        status: rootItemsErrorStatus,
        body: "",
      });
    } else {
      setupRootCollectionItemsEndpoint({ rootCollectionItems });
    }

    setupCollectionsEndpoints({
      collections: sharedTenantCollections,
      rootCollection: ROOT_TEST_COLLECTION,
    });
  }

  setupCollectionByIdEndpoint({ collections: drillableCollections });

  setupCollectionItemsEndpoint({
    collection: PROMOTED_TEST_COLLECTION,
    collectionItems: [
      createMockCollectionItem({
        id: 8,
        model: "dashboard",
        name: "Promoted Dashboard",
      }),
    ],
  });
  sharedTenantCollections.forEach((collection) =>
    setupCollectionItemsEndpoint({ collection, collectionItems: [] }),
  );

  const { state } = setupSdkState({
    ...(currentUser ? { currentUser } : {}),
    ...(tokenFeatures ? { tokenFeatures } : {}),
    settingValues: createMockSettings({
      "enable-embedding-sdk": true,
      "use-tenants": useTenants,
    }),
  });

  if (hasTenantsPlugin) {
    setupEnterpriseOnlyPlugin("tenants");
  }

  renderWithSDKProviders(
    <CollectionBrowserInner collectionId="all" {...props} />,
    {
      componentProviderProps: {
        authConfig: createMockSdkConfig(),
      },
      storeInitialState: state,
    },
  );

  if (waitForList) {
    expect(
      await screen.findByTestId("all-collections-list"),
    ).toBeInTheDocument();
  }
}
