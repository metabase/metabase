/* istanbul ignore file */
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupDashboardQuestionCandidatesEndpoint,
  setupStaleItemsEndpoint,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type {
  Collection,
  DashboardQuestionCandidate,
  TokenFeatures,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { CollectionMenu } from "../CollectionMenu";

export interface SetupOpts {
  collection?: Collection;
  tokenFeatures?: TokenFeatures;
  isAdmin?: boolean;
  isPersonalCollectionChild?: boolean;
  hasEnterprisePlugins?: boolean;
  dashboardQuestionCandidates?: DashboardQuestionCandidate[];
  moveToDashboard?: boolean;
  collectionMenu?: boolean;
  numberOfCollectionItems?: number;
  numberOfStaleItems?: number;
}

export const setup = ({
  collection = createMockCollection(),
  tokenFeatures = createMockTokenFeatures(),
  isAdmin = false,
  isPersonalCollectionChild = false,
  hasEnterprisePlugins = false,
  dashboardQuestionCandidates = [],
  moveToDashboard = false,
  collectionMenu = false,
  numberOfCollectionItems = 10,
  numberOfStaleItems = 0,
}: SetupOpts) => {
  // We need a mock to get the total number of items in a collection, but we don't need to
  // access the data - only the total
  fetchMock.get(`path:/api/collection/${collection.id}/items`, {
    total: numberOfCollectionItems,
  });
  setupDashboardQuestionCandidatesEndpoint(dashboardQuestionCandidates);
  setupUserKeyValueEndpoints({
    namespace: "user_acknowledgement",
    key: "collection-menu",
    value: collectionMenu,
  });

  setupUserKeyValueEndpoints({
    namespace: "user_acknowledgement",
    key: "move-to-dashboard",
    value: moveToDashboard,
  });

  const state = createMockState({
    settings: mockSettings({ "token-features": tokenFeatures }),
    currentUser: createMockUser({ is_superuser: isAdmin }),
  });

  const onUpdateCollection = jest.fn();

  if (hasEnterprisePlugins) {
    setupStaleItemsEndpoint(numberOfStaleItems);
    setupEnterprisePlugins();
  }

  renderWithProviders(
    <>
      <Route
        path="/"
        component={() => (
          <CollectionMenu
            collection={collection}
            isAdmin={isAdmin}
            isPersonalCollectionChild={isPersonalCollectionChild}
            onUpdateCollection={onUpdateCollection}
          />
        )}
      />
    </>,
    { storeInitialState: state, initialRoute: "/", withRouter: true },
  );

  return { onUpdateCollection };
};
