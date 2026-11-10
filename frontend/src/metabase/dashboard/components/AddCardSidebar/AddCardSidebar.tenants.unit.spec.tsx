import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
} from "__support__/server-mocks";
import { setupTenantEntpoints } from "__support__/server-mocks/tenant";
import { mockSettings } from "__support__/settings";
import { createMockDashboardState, createMockState } from "__support__/state";
import { renderWithProviders, screen, within } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import type { AddCardToDashboardOpts } from "metabase/dashboard/actions/cards-typed";
import { MockDashboardContext } from "metabase/dashboard/context/mock-context";
import type { Collection } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockTenant,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { AddCardSidebar } from "./AddCardSidebar";

const CURRENT_USER_ID = 1;
const PERSONAL_COLLECTION_ID = 100;

const OUR_ANALYTICS = createMockCollection({
  ...ROOT_COLLECTION,
  can_write: true,
});

const PERSONAL_COLLECTION = createMockCollection({
  id: PERSONAL_COLLECTION_ID,
  name: "acme user's Personal Collection",
  personal_owner_id: CURRENT_USER_ID,
  is_personal: true,
  location: "/",
});

const TENANT_COLLECTION = createMockCollection({
  id: 200,
  name: "Tenant collection: Acme",
  location: "/",
  namespace: "tenant-specific",
});

const TENANT_SUBCOLLECTION = createMockCollection({
  id: 201,
  name: "Tenant questions",
  location: `/${TENANT_COLLECTION.id}/`,
  namespace: "tenant-specific",
});

const SHARED_COLLECTIONS = ["Finance", "Marketing"].map((name, index) =>
  createMockCollection({
    id: 300 + index,
    name,
    location: "/",
    namespace: "shared-tenant-collection",
  }),
);

const TENANT = createMockTenant({
  id: 1,
  name: "Acme",
  slug: "acme",
  tenant_collection_id: TENANT_COLLECTION.id,
});

const TENANT_QUESTION = createMockCollectionItem({
  id: 400,
  model: "card",
  name: "Tenant orders",
});

interface SetupOpts {
  dashboardCollection: Collection;
  collections: Collection[];
  isTenantUser?: boolean;
}

function setup({
  dashboardCollection,
  collections,
  isTenantUser = false,
}: SetupOpts) {
  const dashboard = createMockDashboard({ collection: dashboardCollection });
  const addCardToDashboard = jest.fn<void, [AddCardToDashboardOpts]>();

  setupCollectionsEndpoints({
    collections,
    treeOnlyCollections: [
      TENANT_COLLECTION,
      TENANT_SUBCOLLECTION,
      ...SHARED_COLLECTIONS,
    ],
  });
  setupTenantEntpoints([TENANT]);
  setupCollectionItemsEndpoint({
    collection: TENANT_SUBCOLLECTION,
    collectionItems: [TENANT_QUESTION],
  });
  [TENANT_COLLECTION, dashboardCollection].forEach((collection) =>
    setupCollectionItemsEndpoint({ collection, collectionItems: [] }),
  );

  setupEnterprisePlugins();

  renderWithProviders(
    <MockDashboardContext
      dashboardId={dashboard.id}
      navigateToNewCardFromDashboard={null}
      addCardToDashboard={addCardToDashboard}
    >
      <AddCardSidebar />
    </MockDashboardContext>,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({
          id: CURRENT_USER_ID,
          personal_collection_id: PERSONAL_COLLECTION_ID,
          tenant_id: isTenantUser ? TENANT.id : null,
        }),
        settings: mockSettings({
          "use-tenants": true,
          "token-features": createMockTokenFeatures({ tenants: true }),
        }),
        dashboard: createMockDashboardState({
          dashboards: { [dashboard.id]: { ...dashboard, dashcards: [] } },
          dashboardId: dashboard.id,
        }),
      }),
    },
  );

  return { dashboard, addCardToDashboard };
}

const getBreadcrumbs = () => screen.getByTestId("breadcrumbs");

const goToTopLevel = () =>
  userEvent.click(within(getBreadcrumbs()).getByText("Collections"));

describe("AddCardSidebar with tenants (EMB-2312)", () => {
  beforeAll(() => {
    mockSettings({
      "token-features": createMockTokenFeatures({ tenants: true }),
    });
  });

  describe("admins", () => {
    it("should add questions from the dashboard's tenant-specific collection", async () => {
      const { dashboard, addCardToDashboard } = setup({
        dashboardCollection: TENANT_COLLECTION,
        collections: [OUR_ANALYTICS],
      });

      await screen.findByRole("menuitem", { name: TENANT_SUBCOLLECTION.name });
      expect(within(getBreadcrumbs()).getByText("Acme")).toBeInTheDocument();
      expect(getBreadcrumbs()).not.toHaveTextContent("Unknown");

      await userEvent.click(
        screen.getByRole("menuitem", { name: TENANT_SUBCOLLECTION.name }),
      );
      await userEvent.click(
        await screen.findByRole("menuitem", { name: TENANT_QUESTION.name }),
      );

      expect(addCardToDashboard).toHaveBeenCalledTimes(1);
      expect(addCardToDashboard).toHaveBeenCalledWith(
        expect.objectContaining({
          dashId: dashboard.id,
          cardId: TENANT_QUESTION.id,
        }),
      );
    });

    it("should browse to tenant questions from Our analytics", async () => {
      const { addCardToDashboard } = setup({
        dashboardCollection: OUR_ANALYTICS,
        collections: [OUR_ANALYTICS],
      });

      await screen.findByText("Collections");
      expect(getBreadcrumbs()).toHaveTextContent("Collections");
      expect(getBreadcrumbs()).toHaveTextContent("Our analytics");

      await goToTopLevel();

      expect(
        screen.getByRole("menuitem", { name: "Our analytics" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("menuitem", { name: "Shared collections" }),
      ).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("menuitem", { name: "Tenant collections" }),
      );
      await userEvent.click(screen.getByRole("menuitem", { name: "Acme" }));
      await userEvent.click(
        screen.getByRole("menuitem", { name: TENANT_SUBCOLLECTION.name }),
      );
      await userEvent.click(
        await screen.findByRole("menuitem", { name: TENANT_QUESTION.name }),
      );

      expect(addCardToDashboard).toHaveBeenCalledTimes(1);
      expect(addCardToDashboard).toHaveBeenCalledWith(
        expect.objectContaining({ cardId: TENANT_QUESTION.id }),
      );
    });
  });

  describe("tenant users", () => {
    it("should show a flattened collection tree with their tenant collection as 'Our data'", async () => {
      setup({
        dashboardCollection: TENANT_SUBCOLLECTION,
        collections: [PERSONAL_COLLECTION],
        isTenantUser: true,
      });

      await screen.findByText("Our data");
      expect(getBreadcrumbs()).toHaveTextContent("Collections");
      expect(getBreadcrumbs()).toHaveTextContent("Our data");

      await goToTopLevel();

      expect(
        screen.getByRole("menuitem", { name: "Our data" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("menuitem", { name: "Finance" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("menuitem", { name: "Marketing" }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Our analytics")).not.toBeInTheDocument();
      expect(screen.queryByText("Shared collections")).not.toBeInTheDocument();
      expect(screen.queryByText("Tenant collections")).not.toBeInTheDocument();
    });

    it("should show their personal collection directly below 'Collections'", async () => {
      setup({
        dashboardCollection: PERSONAL_COLLECTION,
        collections: [PERSONAL_COLLECTION],
        isTenantUser: true,
      });

      await screen.findByText("My personal collection");
      expect(getBreadcrumbs()).toHaveTextContent("Collections");

      await goToTopLevel();

      expect(
        screen.getByRole("menuitem", { name: "My personal collection" }),
      ).toBeInTheDocument();
      expect(within(getBreadcrumbs()).getAllByText("Collections")).toHaveLength(
        1,
      );
      expect(
        screen.queryByRole("menuitem", { name: "Collections" }),
      ).not.toBeInTheDocument();
    });
  });
});
