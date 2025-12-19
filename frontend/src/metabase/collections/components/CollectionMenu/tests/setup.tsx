/* istanbul ignore file */
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupDashboardQuestionCandidatesEndpoint,
  setupStaleItemsEndpoint,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
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
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  dashboardQuestionCandidates?: DashboardQuestionCandidate[];
  moveToDashboard?: boolean;
  numberOfCollectionItems?: number;
  numberOfStaleItems?: number;
}

export const setup = ({
  collection = createMockCollection(),
  tokenFeatures = createMockTokenFeatures(),
  isAdmin = false,
  enterprisePlugins,
  dashboardQuestionCandidates = [],
  moveToDashboard = false,
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
    namespace: "indicator-menu",
    key: "collection-menu",
    value: [],
  });

  setupUserKeyValueEndpoints({
    namespace: "user_acknowledgement",
    key: "move-to-dashboard",
    value: moveToDashboard,
  });

  setupUserKeyValueEndpoints({
    namespace: "user_acknowledgement",
    key: "clean-stale-items",
    value: moveToDashboard,
  });

  const state = createMockState({
    settings: mockSettings({ "token-features": tokenFeatures }),
    currentUser: createMockUser({ is_superuser: isAdmin }),
  });

  const onUpdateCollection = jest.fn();

  if (enterprisePlugins) {
    setupStaleItemsEndpoint(numberOfStaleItems);
    enterprisePlugins.forEach((plugin) => setupEnterpriseOnlyPlugin(plugin));
  }

  renderWithProviders(
    <>
      <Route
        path="/"
        component={() => (
          <CollectionMenu
            collection={collection}
            isAdmin={isAdmin}
            onUpdateCollection={onUpdateCollection}
          />
        )}
      />
    </>,
    { storeInitialState: state, initialRoute: "/", withRouter: true },
  );

  return { onUpdateCollection };
};

export const assertIndicatorVisible = async () => {
  await waitFor(async () =>
    expect(
      (await screen.findByTestId("menu-indicator-root")).querySelector(
        "[class*=indicator]",
      ),
    ).toBeInTheDocument(),
  );
};

export const assertIndicatorHidden = async () => {
  await fetchMock.callHistory.flush();
  await waitFor(() =>
    expect(screen.queryByTestId("thing-is-loading")).not.toBeInTheDocument(),
  );
  expect(
    (await screen.findByTestId("menu-indicator-root")).querySelector(
      "[class*=indicator]",
    ),
  ).not.toBeInTheDocument();
};
