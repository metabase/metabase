import { useEffect, useState } from "react";
import { P, match } from "ts-pattern";

import {
  setupAlertsEndpoints,
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDashboardEndpoints,
  setupDashboardQueryMetadataEndpoint,
  setupDatabaseEndpoints,
  setupDatabaseListEndpoint,
  setupTableEndpoints,
} from "__support__/server-mocks";
import { setupNotificationChannelsEndpoints } from "__support__/server-mocks/pulse";
import { CollectionBrowser } from "embedding-sdk-bundle/components/public/CollectionBrowser";
import { InteractiveQuestion } from "embedding-sdk-bundle/components/public/InteractiveQuestion";
import { InteractiveDashboard } from "embedding-sdk-bundle/components/public/dashboard/InteractiveDashboard";
import { useSdkBreadcrumbs } from "embedding-sdk-bundle/hooks/private/use-sdk-breadcrumb";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";
import type { SdkCollectionId } from "embedding-sdk-bundle/types";
import type { SdkBreadcrumbItemType } from "embedding-sdk-bundle/types/breadcrumb";
import { useLocale } from "metabase/common/hooks/use-locale";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import { Stack } from "metabase/ui";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockDashboardQueryMetadata,
  createMockDatabase,
  createMockDataset,
  createMockTable,
  createMockUser,
} from "metabase-types/api/mocks";

import { SdkBreadcrumbs } from "./SdkBreadcrumbs";
import { SdkBreadcrumbsProvider } from "./SdkBreadcrumbsProvider";

jest.mock("metabase/common/hooks/use-locale", () => ({
  useLocale: jest.fn(),
}));

const useLocaleMock = useLocale as jest.Mock;

type View =
  | { type: "collection"; id: SdkCollectionId }
  | { type: Exclude<SdkBreadcrumbItemType, "collection">; id: string | number };

export const BreadcrumbsTestComponent = () => {
  const { currentLocation } = useSdkBreadcrumbs();
  const [view, setView] = useState<View>({ type: "collection", id: "root" });

  useEffect(() => {
    if (currentLocation?.type === "collection") {
      setView({ type: currentLocation.type, id: currentLocation.id });
    }
  }, [currentLocation]);

  const viewContent = match(view)
    .with({ type: "collection" }, () => (
      <CollectionBrowser
        collectionId={view.id}
        onClick={(item) => {
          const type = match<string, SdkBreadcrumbItemType>(item.model)
            .with("card", () => "question")
            .with("dataset", () => "model")
            .otherwise((model) => model as SdkBreadcrumbItemType);

          setView({ type, id: item.id });
        }}
      />
    ))
    .with({ type: "dashboard" }, () => (
      <InteractiveDashboard dashboardId={view.id} />
    ))
    .with({ type: P.union("question", "metric", "model") }, () => (
      <InteractiveQuestion questionId={view.id} />
    ))
    .exhaustive();

  return (
    <Stack p="md" gap="sm">
      <div data-testid="breadcrumbs-container">
        <SdkBreadcrumbs />
      </div>
      <div data-testid="current-view-type">{view.type}</div>
      <div data-testid="current-view-id">{view.id}</div>
      {viewContent}
    </Stack>
  );
};

export const setup = async () => {
  useLocaleMock.mockReturnValue({ isLocaleLoading: false });

  const TEST_DATABASE = createMockDatabase({ id: 1 });

  const ROOT_TEST_COLLECTION = createMockCollection({
    ...ROOT_COLLECTION,
    can_write: false,
    effective_ancestors: [],
    id: "root",
    name: "Our analytics", // This is what shows up in breadcrumbs
  });

  const NESTED_COLLECTION = createMockCollection({
    archived: false,
    can_write: true,
    description: "A nested collection",
    id: 2,
    location: "/",
    name: "Nested Collection",
  });

  const TEST_DASHBOARD = createMockDashboard({
    id: 1,
    name: "Test Dashboard",
    dashcards: [],
  });

  const TEST_TABLE = createMockTable({
    id: 1,
    db_id: TEST_DATABASE.id,
  });

  const TEST_CARD = createMockCard({
    id: 1,
    name: "Test Question",
  });

  const collectionItems = [
    createMockCollectionItem({
      id: 2,
      model: "collection",
      name: "Nested Collection",
    }),
    createMockCollectionItem({
      id: 1,
      model: "dashboard",
      name: "Test Dashboard",
    }),
    createMockCollectionItem({
      id: 1,
      model: "card",
      name: "Test Question",
    }),
  ];

  setupCollectionsEndpoints({
    collections: [ROOT_TEST_COLLECTION, NESTED_COLLECTION],
  });

  setupCollectionByIdEndpoint({
    collections: [ROOT_TEST_COLLECTION, NESTED_COLLECTION],
  });

  setupCollectionItemsEndpoint({
    collection: ROOT_TEST_COLLECTION,
    collectionItems,
  });

  setupCollectionItemsEndpoint({
    collection: NESTED_COLLECTION,
    collectionItems: [],
  });

  setupDashboardEndpoints(TEST_DASHBOARD);

  setupDashboardQueryMetadataEndpoint(
    TEST_DASHBOARD,
    createMockDashboardQueryMetadata({
      databases: [TEST_DATABASE],
    }),
  );

  setupCardEndpoints(TEST_CARD);
  setupCardQueryEndpoints(TEST_CARD, createMockDataset());
  setupCardQueryMetadataEndpoint(
    TEST_CARD,
    createMockCardQueryMetadata({
      databases: [TEST_DATABASE],
    }),
  );
  setupAlertsEndpoints(TEST_CARD, []);
  setupDatabaseEndpoints(TEST_DATABASE);
  setupDatabaseListEndpoint([TEST_DATABASE]);
  setupTableEndpoints(TEST_TABLE);

  setupNotificationChannelsEndpoints({});

  const state = setupSdkState({ currentUser: createMockUser() });

  return renderWithSDKProviders(
    <SdkBreadcrumbsProvider>
      <BreadcrumbsTestComponent />
    </SdkBreadcrumbsProvider>,
    {
      componentProviderProps: {
        authConfig: createMockSdkConfig(),
      },
      storeInitialState: state,
    },
  );
};
