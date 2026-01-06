import dayjs from "dayjs";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCardsEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupSearchEndpoints,
  setupSettingEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import type { ModelResult } from "metabase/browse/models";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import * as domUtils from "metabase/lib/dom";
import type { Card, Dashboard, DashboardId, User } from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import type { DashboardState } from "metabase-types/store";
import {
  createMockDashboardState,
  createMockQueryBuilderState,
  createMockState,
} from "metabase-types/store/mocks";

import MainNavbar from "../MainNavbar";

export type SetupOpts = {
  pathname?: string;
  route?: string;
  user?: User | null;
  hasDataAccess?: boolean;
  withAdditionalDatabase?: boolean;
  isUploadEnabled?: boolean;
  openQuestionCard?: Card;
  openDashboard?: Dashboard;
  models?: ModelResult[];
  canCurateRootCollection?: boolean;
  instanceCreationDate?: string;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  hasDWHAttached?: boolean;
  isEmbeddingIframe?: boolean;
  hasWhitelabelToken?: boolean;
  hasEmbeddingFeature?: boolean;
  applicationName?: string;
  activeUsersCount?: number;
};

export const PERSONAL_COLLECTION_BASE = createMockCollection({
  id: 1,
  name: "'Your personal collection",
  originalName: "John's Personal Collection",
});

export const TEST_COLLECTION = createMockCollection({
  id: 2,
  name: "Test collection",
});

export async function setup({
  pathname = "/",
  route = pathname,
  user = createMockUser(),
  activeUsersCount = 2,
  hasDataAccess = true,
  openDashboard,
  openQuestionCard,
  models = [],
  isUploadEnabled = false,
  withAdditionalDatabase = true,
  canCurateRootCollection = false,
  instanceCreationDate = dayjs().toISOString(),
  enterprisePlugins,
  hasDWHAttached = false,
  isEmbeddingIframe,
  hasWhitelabelToken,
  hasEmbeddingFeature,
  applicationName = "Metabase",
}: SetupOpts = {}) {
  if (isEmbeddingIframe) {
    jest.spyOn(domUtils, "isWithinIframe").mockReturnValue(true);
  }

  const SAMPLE_DATABASE = createMockDatabase({
    id: 1,
    name: "Sample Database",
    is_sample: true,
    can_upload: user?.is_superuser || (isUploadEnabled && hasDataAccess),
  });

  const USER_DATABASE = createMockDatabase({
    id: 2,
    name: "User Database",
    is_sample: false,
  });

  const databases = [];

  if (hasDataAccess) {
    databases.push(SAMPLE_DATABASE);

    if (withAdditionalDatabase) {
      databases.push(USER_DATABASE);
    }
  }
  const OUR_ANALYTICS = createMockCollection({
    ...ROOT_COLLECTION,
    can_write: user?.is_superuser || canCurateRootCollection,
  });

  const collections = [TEST_COLLECTION];

  const personalCollection = user
    ? createMockCollection({
        ...PERSONAL_COLLECTION_BASE,
        personal_owner_id: user.id,
      })
    : null;

  if (personalCollection && user) {
    user.personal_collection_id = 1;
    collections.push(personalCollection);
  }

  setupCollectionsEndpoints({
    collections,
    rootCollection: OUR_ANALYTICS,
    currentUserId: user?.id,
  });
  setupCollectionByIdEndpoint({
    collections: [PERSONAL_COLLECTION_BASE, TEST_COLLECTION],
  });
  setupDatabasesEndpoints(databases);
  setupSearchEndpoints(models);
  setupCollectionItemsEndpoint({
    collection: createMockCollection(OUR_ANALYTICS),
    collectionItems: [],
  });

  setupSettingEndpoint({
    settingKey: "version-info",
    settingValue: {},
  });

  fetchMock.get("path:/api/bookmark", []);

  if (openQuestionCard) {
    setupCardsEndpoints([openQuestionCard]);
  }

  let dashboardId: DashboardId | null = null;
  const dashboardsForState: DashboardState["dashboards"] = {};
  const dashboardsForEntities: Dashboard[] = [];
  if (openDashboard) {
    dashboardId = openDashboard.id;
    dashboardsForState[openDashboard.id] = {
      ...openDashboard,
      dashcards: openDashboard.dashcards.map((c) => c.id),
    };
    dashboardsForEntities.push(openDashboard);
  }

  const storeInitialState = createMockState({
    currentUser: user,
    dashboard: createMockDashboardState({
      dashboardId,
      dashboards: dashboardsForState,
    }),
    qb: createMockQueryBuilderState({ card: openQuestionCard }),
    entities: createMockEntitiesState({ dashboards: dashboardsForEntities }),
    settings: mockSettings({
      "application-name": applicationName,
      "uploads-settings": {
        db_id: hasDWHAttached || isUploadEnabled ? SAMPLE_DATABASE.id : null,
        schema_name: null,
        table_prefix: null,
      },
      "instance-creation": instanceCreationDate,
      "token-features": createMockTokenFeatures({
        attached_dwh: hasDWHAttached,
        hosting: true,
        upload_management: true,
        whitelabel: hasWhitelabelToken,
        embedding: hasEmbeddingFeature,
      }),
      "show-google-sheets-integration": true,
      "active-users-count": activeUsersCount,
    }),
  });

  if (enterprisePlugins) {
    enterprisePlugins.forEach((plugin) => {
      setupEnterpriseOnlyPlugin(plugin);
    });
  }

  renderWithProviders(
    <Route
      path={route}
      component={(props) => <MainNavbar {...props} isOpen />}
    />,
    {
      storeInitialState,
      initialRoute: pathname,
      withRouter: true,
      withDND: true,
    },
  );

  await waitForLoaderToBeRemoved();
  await waitForLoaderToBeRemoved(); // tests will fail without the 2nd call
}

export async function setupCollectionPage({
  pathname = "/",
  route = "/collection/:slug",
}: Pick<SetupOpts, "pathname" | "route"> = {}) {
  await setup({ pathname, route });

  const rootCollectionElements = {
    link: screen.getByRole("link", { name: /Our analytics/i }),
    listItem: screen.getByRole("treeitem", { name: /Our analytics/i }),
  };

  const personalCollectionElements = {
    link: screen.getByRole("link", { name: /Your personal collection/i }),
    listItem: screen.getByRole("treeitem", {
      name: /Your personal collection/i,
    }),
  };

  const regularCollectionElements = {
    link: screen.getByRole("link", { name: /Test collection/i }),
    listItem: screen.getByRole("treeitem", { name: /Test collection/i }),
  };

  return {
    rootCollectionElements,
    personalCollectionElements,
    regularCollectionElements,
  };
}
