import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
} from "__support__/server-mocks";
import { setupTenantEntpoints } from "__support__/server-mocks/tenant";
import { mockSettings } from "__support__/settings";
import { createMockDashboardState, createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { MockDashboardContext } from "metabase/dashboard/context/mock-context";
import type { Card, Collection } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockDataset,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { AddCardSidebar } from "./AddCardSidebar";

const TENANT_NAMESPACE = "shared-tenant-collection";
const TENANT_ROOT_NAME = "Shared collections";

const ROOT = createMockCollection({ ...ROOT_COLLECTION, can_write: true });

const OUR_ANALYTICS_SUB = createMockCollection({
  id: 20,
  name: "Our Analytics Sub",
  location: "/",
  can_write: true,
});

// Listed before the target, so code that always opens the first tenant
// collection opens the wrong one.
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

const OTHER_TENANT_CARD = createMockCard({
  id: 101,
  name: "Other Tenant Question",
  collection_id: Number(TENANT_COLLECTION.id),
});

const TENANT_CARD = createMockCard({
  id: 102,
  name: "Tenant Orders Question",
  collection_id: Number(TENANT_COLLECTION.id),
});

const TENANT_SUB_CARD = createMockCard({
  id: 103,
  name: "Tenant Sub-Collection Orders Question",
  collection_id: Number(TENANT_SUB_COLLECTION.id),
});

const REGULAR_COLLECTIONS = [ROOT, OUR_ANALYTICS_SUB];

// Like the API, the tree nests each collection in its parent's `children`.
const SHARED_COLLECTION_TREE: Collection[] = [
  { ...OTHER_TENANT_COLLECTION, children: [] },
  {
    ...TENANT_COLLECTION,
    children: [{ ...TENANT_SUB_COLLECTION, children: [] }],
  },
];

const toCardItem = (card: Card) =>
  createMockCollectionItem({ id: card.id, name: card.name, model: "card" });

interface SetupOpts {
  useTenants?: boolean;
}

function setup({ useTenants = true }: SetupOpts = {}) {
  // Registered first, so these win over the flat tree of the shared helper.
  fetchMock.get({
    url: "path:/api/collection/tree",
    query: { namespace: TENANT_NAMESPACE },
    response: SHARED_COLLECTION_TREE,
    name: "shared-tenant-collection-tree",
  });
  fetchMock.get({
    url: "path:/api/collection/tree",
    query: { namespace: "tenant-specific" },
    response: [],
    name: "tenant-specific-collection-tree",
  });
  setupCollectionsEndpoints({
    collections: REGULAR_COLLECTIONS,
    rootCollection: ROOT,
  });
  setupTenantEntpoints([]);

  setupCollectionItemsEndpoint({ collection: ROOT, collectionItems: [] });
  setupCollectionItemsEndpoint({
    collection: OUR_ANALYTICS_SUB,
    collectionItems: [],
  });
  setupCollectionItemsEndpoint({
    collection: OTHER_TENANT_COLLECTION,
    collectionItems: [],
  });
  setupCollectionItemsEndpoint({
    collection: TENANT_COLLECTION,
    collectionItems: [toCardItem(OTHER_TENANT_CARD), toCardItem(TENANT_CARD)],
  });
  setupCollectionItemsEndpoint({
    collection: TENANT_SUB_COLLECTION,
    collectionItems: [toCardItem(TENANT_SUB_CARD)],
  });
  [OTHER_TENANT_CARD, TENANT_CARD, TENANT_SUB_CARD].forEach((card) => {
    setupCardEndpoints(card);
    setupCardQueryEndpoints(card, createMockDataset());
    setupCardQueryMetadataEndpoint(card, createMockCardQueryMetadata());
  });

  const dashboard = createMockDashboard({ collection: ROOT });

  // `mockSettings` sets the token features that the plugin reads when it
  // initializes, so it has to run first.
  const storeInitialState = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    settings: mockSettings({
      "use-tenants": useTenants,
      "token-features": createMockTokenFeatures({ tenants: true }),
    }),
    dashboard: createMockDashboardState({
      dashboards: { [dashboard.id]: { ...dashboard, dashcards: [] } },
      dashboardId: dashboard.id,
    }),
  });
  setupEnterpriseOnlyPlugin("tenants");

  const { store } = renderWithProviders(
    <MockDashboardContext
      dashboardId={dashboard.id}
      navigateToNewCardFromDashboard={null}
    >
      <AddCardSidebar />
    </MockDashboardContext>,
    { storeInitialState },
  );

  const getAddedCardIds = () => {
    const { dashboards, dashcards } = store.getState().dashboard;
    return dashboards[dashboard.id].dashcards.map(
      (dashcardId) => dashcards[dashcardId].card_id,
    );
  };

  return { getAddedCardIds };
}

const getBreadcrumbs = () => screen.getByTestId("breadcrumbs");

const findMenuItem = (name: string) => screen.findByRole("menuitem", { name });

const expectBreadcrumbs = (collections: Pick<Collection, "name">[]) =>
  waitFor(() =>
    expect(getBreadcrumbs()).toHaveTextContent(
      collections.map(({ name }) => name).join(""),
    ),
  );

const COLLECTIONS_CRUMB = { name: "Collections" };
const TENANT_ROOT_CRUMB = { name: TENANT_ROOT_NAME };

async function openTopLevel() {
  await expectBreadcrumbs([COLLECTIONS_CRUMB, ROOT]);
  await userEvent.click(within(getBreadcrumbs()).getByText("Collections"));
  expect(await findMenuItem(ROOT.name)).toBeInTheDocument();
  expect(await findMenuItem(TENANT_ROOT_NAME)).toBeInTheDocument();
}

const getCardRequestIds = () =>
  fetchMock.callHistory
    .calls()
    .map(({ url }) => new URL(url).pathname.match(/^\/api\/card\/(\d+)$/))
    .flatMap((match) => (match ? [Number(match[1])] : []));

describe("AddCardSidebar > shared tenant collections", () => {
  it("should not show shared collections when tenants are disabled", async () => {
    setup({ useTenants: false });

    expect(await findMenuItem(OUR_ANALYTICS_SUB.name)).toBeInTheDocument();
    expect(getBreadcrumbs()).toHaveTextContent(ROOT.name);
    expect(getBreadcrumbs()).not.toHaveTextContent("Collections");
    expect(screen.queryByText(TENANT_ROOT_NAME)).not.toBeInTheDocument();
    expect(fetchMock.callHistory.called("path:/api/collection/tree")).toBe(
      false,
    );
  });

  it("should browse shared collections via breadcrumbs and add a question", async () => {
    const { getAddedCardIds } = setup();

    await openTopLevel();

    await userEvent.click(await findMenuItem(TENANT_ROOT_NAME));
    await expectBreadcrumbs([COLLECTIONS_CRUMB, TENANT_ROOT_CRUMB]);
    expect(
      await findMenuItem(OTHER_TENANT_COLLECTION.name),
    ).toBeInTheDocument();

    await userEvent.click(await findMenuItem(TENANT_COLLECTION.name));
    await expectBreadcrumbs([
      COLLECTIONS_CRUMB,
      TENANT_ROOT_CRUMB,
      TENANT_COLLECTION,
    ]);

    await userEvent.click(await findMenuItem(TENANT_CARD.name));

    await waitFor(() => expect(getAddedCardIds()).toEqual([TENANT_CARD.id]));
    expect(getCardRequestIds()).toContain(TENANT_CARD.id);
    expect(getCardRequestIds()).not.toContain(OTHER_TENANT_CARD.id);
  });

  it("should add a question from a shared tenant sub-collection", async () => {
    const { getAddedCardIds } = setup();

    await openTopLevel();
    await userEvent.click(await findMenuItem(TENANT_ROOT_NAME));
    await userEvent.click(await findMenuItem(TENANT_COLLECTION.name));
    await userEvent.click(await findMenuItem(TENANT_SUB_COLLECTION.name));
    await expectBreadcrumbs([
      COLLECTIONS_CRUMB,
      TENANT_ROOT_CRUMB,
      TENANT_COLLECTION,
      TENANT_SUB_COLLECTION,
    ]);

    await userEvent.click(await findMenuItem(TENANT_SUB_CARD.name));

    await waitFor(() =>
      expect(getAddedCardIds()).toEqual([TENANT_SUB_CARD.id]),
    );
  });

  it("should show 'Collections' in the breadcrumbs inside Our analytics sub-collections", async () => {
    setup();

    await openTopLevel();

    await userEvent.click(await findMenuItem(ROOT.name));
    await expectBreadcrumbs([COLLECTIONS_CRUMB, ROOT]);

    await userEvent.click(await findMenuItem(OUR_ANALYTICS_SUB.name));
    await expectBreadcrumbs([COLLECTIONS_CRUMB, ROOT, OUR_ANALYTICS_SUB]);
  });
});
