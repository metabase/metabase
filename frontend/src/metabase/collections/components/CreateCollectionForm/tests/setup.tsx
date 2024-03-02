/* istanbul ignore file */
import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupCollectionsEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders } from "__support__/ui";
import type { TokenFeatures, User } from "metabase-types/api";
import {
  createMockCollection,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import CreateCollectionForm from "../CreateCollectionForm";

const ROOT_COLLECTION = createMockCollection({
  id: "root",
  name: "Our analytics",
  can_write: true,
});

export interface SetupOpts {
  user?: User;
  tokenFeatures?: TokenFeatures;
  hasEnterprisePlugins?: boolean;
}

export const setup = ({
  user = createMockUser({ is_superuser: true }),
  tokenFeatures = createMockTokenFeatures(),
  hasEnterprisePlugins = false,
}: SetupOpts = {}) => {
  const settings = mockSettings({ "token-features": tokenFeatures });
  const onCancel = jest.fn();

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }
  setupCollectionsEndpoints({
    collections: [],
    rootCollection: ROOT_COLLECTION,
  });
  renderWithProviders(<CreateCollectionForm onCancel={onCancel} />, {
    storeInitialState: createMockState({
      currentUser: user,
      settings,
      entities: createMockEntitiesState({
        collections: [ROOT_COLLECTION],
      }),
    }),
  });

  return { onCancel };
};
