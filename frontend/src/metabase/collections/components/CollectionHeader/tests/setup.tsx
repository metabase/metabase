import { setupEnterprisePlugins } from "__support__/enterprise";
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
  isPersonalCollectionChild: false,
  onUpdateCollection: jest.fn(),
  onCreateBookmark: jest.fn(),
  saveFile: jest.fn(),
  onDeleteBookmark: jest.fn(),
  ...opts,
});

export const setup = ({
  collection,
  hasEnterprisePlugins = false,
  tokenFeatures,
  ...otherProps
}: {
  collection?: Partial<Collection>;
  hasEnterprisePlugins?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
} & Partial<Omit<CollectionHeaderProps, "collection">> = {}) => {
  setupDashboardQuestionCandidatesEndpoint([]);
  setupUserKeyValueEndpoints({
    key: "collection-menu",
    namespace: "user_acknowledgement",
    value: true,
  });
  setupUserKeyValueEndpoints({
    key: "move-to-dashboard",
    namespace: "user_acknowledgement",
    value: true,
  });

  const props = getProps({
    collection: createMockCollection(collection),
    ...otherProps,
  });

  const settings = mockSettings({
    "token-features": createMockTokenFeatures(tokenFeatures),
  });
  const state = createMockState({ settings });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  renderWithProviders(<CollectionHeader {...props} />, {
    storeInitialState: state,
  });

  return props;
};
