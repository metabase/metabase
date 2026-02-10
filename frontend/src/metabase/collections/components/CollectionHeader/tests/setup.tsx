import { Route } from "react-router";

import {
  setupEnterpriseOnlyPlugin,
  setupEnterprisePlugins,
} from "__support__/enterprise";
import {
  setupDashboardQuestionCandidatesEndpoint,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type { Collection, TokenFeatures } from "metabase-types/api";
import {
  createMockCollection,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import type { CollectionHeaderProps } from "../CollectionHeader";
import CollectionHeader from "../CollectionHeader";

const getProps = (
  opts?: Partial<CollectionHeaderProps>,
): CollectionHeaderProps => ({
  collection: createMockCollection(),
  isAdmin: false,
  isBookmarked: false,
  canUpload: false,
  uploadsEnabled: true,
  onUpdateCollection: jest.fn(),
  onCreateBookmark: jest.fn(),
  saveFile: jest.fn(),
  onDeleteBookmark: jest.fn(),
  ...opts,
});

export const setup = ({
  collection,
  enterprisePlugins,
  tokenFeatures,
  ...otherProps
}: {
  collection?: Partial<Collection>;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][] | "*";
  tokenFeatures?: Partial<TokenFeatures>;
} & Partial<Omit<CollectionHeaderProps, "collection">> = {}) => {
  setupDashboardQuestionCandidatesEndpoint([]);
  setupUserKeyValueEndpoints({
    key: "collection-menu",
    namespace: "indicator-menu",
    value: [],
  });
  setupUserKeyValueEndpoints({
    key: "move-to-dashboard",
    namespace: "user_acknowledgement",
    value: true,
  });
  setupUserKeyValueEndpoints({
    key: "events-menu",
    namespace: "user_acknowledgement",
    value: false,
  });

  const props = getProps({
    collection: createMockCollection(collection),
    ...otherProps,
  });

  const settings = mockSettings({
    "token-features": createMockTokenFeatures(tokenFeatures),
  });
  const state = createMockState({ settings });

  if (enterprisePlugins) {
    if (enterprisePlugins === "*") {
      setupEnterprisePlugins();
    } else {
      enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);
    }
  }

  renderWithProviders(
    <Route path="/" component={() => <CollectionHeader {...props} />} />,
    {
      storeInitialState: state,
      initialRoute: "/",
      withRouter: true,
    },
  );

  return props;
};
