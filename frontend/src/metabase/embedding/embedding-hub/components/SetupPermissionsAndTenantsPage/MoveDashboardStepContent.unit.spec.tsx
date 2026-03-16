import fetchMock from "fetch-mock";

import {
  setupCollectionItemsEndpoint,
  setupCollectionTreeEndpoint,
  setupRootCollectionItemsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import { MoveDashboardStepContent } from "./MoveDashboardStepContent";

const SHARED_COLLECTION = createMockCollection({
  id: 42,
  name: "Shared collection",
});

const AUTO_GEN_COLLECTION = createMockCollectionItem({
  id: 99,
  name: "Automatically Generated Dashboards",
  model: "collection",
});

const XRAY_DASHBOARD = createMockCollectionItem({
  id: 200,
  name: "A look at Invoices",
  model: "dashboard",
});

function setup({
  hasSharedCollection = true,
  sharedCollectionDashboards = [] as any[],
  hasXrayDashboard = false,
}: {
  hasSharedCollection?: boolean;
  sharedCollectionDashboards?: any[];
  hasXrayDashboard?: boolean;
} = {}) {
  const onCompleted = jest.fn();

  // Shared tenant collections tree
  setupCollectionTreeEndpoint(hasSharedCollection ? [SHARED_COLLECTION] : []);

  // Shared collection items (dashboards already in shared collection)
  if (hasSharedCollection) {
    setupCollectionItemsEndpoint({
      collection: SHARED_COLLECTION,
      collectionItems: sharedCollectionDashboards,
    });
  }

  // Root collection items (to find "Automatically Generated Dashboards")
  setupRootCollectionItemsEndpoint({
    rootCollectionItems: hasXrayDashboard ? [AUTO_GEN_COLLECTION] : [],
  });

  // Auto-generated dashboards collection items
  if (hasXrayDashboard) {
    setupCollectionItemsEndpoint({
      collection: { id: AUTO_GEN_COLLECTION.id },
      collectionItems: [XRAY_DASHBOARD],
    });

    // DashboardSelector fetches the dashboard details
    fetchMock.get("path:/api/dashboard/200", {
      id: 200,
      name: "A look at Invoices",
      collection_id: AUTO_GEN_COLLECTION.id,
      dashcards: [],
    });
  }

  renderWithProviders(<MoveDashboardStepContent onCompleted={onCompleted} />);

  return { onCompleted };
}

describe("MoveDashboardStepContent", () => {
  it('shows "Continue" when shared collection already has dashboards', async () => {
    setup({
      sharedCollectionDashboards: [
        createMockCollectionItem({
          id: 300,
          name: "Existing dashboard",
          model: "dashboard",
        }),
      ],
    });

    expect(await screen.findByText("Continue")).toBeInTheDocument();
    expect(
      screen.queryByText("Move to shared collection"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Create a sample dashboard"),
    ).not.toBeInTheDocument();
  });

  it('shows only "Create a sample dashboard" when no xray dashboard exists', async () => {
    setup({ hasXrayDashboard: false });

    expect(
      await screen.findByText("Create a sample dashboard"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Move to shared collection"),
    ).not.toBeInTheDocument();
  });

  it('shows both "Move" and "Create" when xray dashboard exists', async () => {
    setup({ hasXrayDashboard: true });

    expect(
      await screen.findByText("Move to shared collection"),
    ).toBeInTheDocument();
    expect(screen.getByText("Create a sample dashboard")).toBeInTheDocument();
  });
});
