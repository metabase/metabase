/* istanbul ignore file */
import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type { Collection, TokenFeatures } from "metabase-types/api";
import {
  createMockCollection,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { CollectionMenu } from "../CollectionMenu";

export interface SetupOpts {
  collection?: Collection;
  tokenFeatures?: TokenFeatures;
  isAdmin?: boolean;
  isPersonalCollectionChild?: boolean;
  hasEnterprisePlugins?: boolean;
}

export const setup = ({
  collection = createMockCollection(),
  tokenFeatures = createMockTokenFeatures(),
  isAdmin = false,
  isPersonalCollectionChild = false,
  hasEnterprisePlugins = false,
}: SetupOpts) => {
  const settings = mockSettings({ "token-features": tokenFeatures });
  const state = createMockState({ settings });
  const onUpdateCollection = jest.fn();

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  renderWithProviders(
    <CollectionMenu
      collection={collection}
      isAdmin={isAdmin}
      isPersonalCollectionChild={isPersonalCollectionChild}
      onUpdateCollection={onUpdateCollection}
    />,
    { storeInitialState: state },
  );

  return { onUpdateCollection };
};
