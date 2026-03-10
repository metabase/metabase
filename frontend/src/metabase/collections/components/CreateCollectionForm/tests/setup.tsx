/* istanbul ignore file */
import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders } from "__support__/ui";
import type {
  CollectionNamespace,
  TokenFeatures,
  User,
} from "metabase-types/api";
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
  showAuthorityLevelPicker?: boolean;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  parentCollectionNamespace?: CollectionNamespace | null;
}

export const setup = ({
  user = createMockUser({ is_superuser: true }),
  tokenFeatures = createMockTokenFeatures(),
  showAuthorityLevelPicker,
  enterprisePlugins,
  parentCollectionNamespace,
}: SetupOpts = {}) => {
  const settings = mockSettings({ "token-features": tokenFeatures });
  const onCancel = jest.fn();

  // Create a parent collection with the specified namespace if provided
  const parentCollection = parentCollectionNamespace
    ? createMockCollection({
        id: 1,
        name: "Parent Collection",
        namespace: parentCollectionNamespace,
        can_write: true,
      })
    : ROOT_COLLECTION;

  const collections =
    parentCollectionNamespace !== undefined
      ? [ROOT_COLLECTION, parentCollection]
      : [ROOT_COLLECTION];

  if (enterprisePlugins) {
    enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);
  }
  setupCollectionsEndpoints({
    collections:
      parentCollectionNamespace !== undefined ? [parentCollection] : [],
    rootCollection: ROOT_COLLECTION,
  });

  // Mock individual collection fetches
  setupCollectionByIdEndpoint({
    collections,
  });

  renderWithProviders(
    <CreateCollectionForm
      onCancel={onCancel}
      showAuthorityLevelPicker={showAuthorityLevelPicker}
      collectionId={parentCollectionNamespace !== undefined ? 1 : undefined}
    />,
    {
      storeInitialState: createMockState({
        currentUser: user,
        settings,
        entities: createMockEntitiesState({
          collections,
        }),
      }),
    },
  );

  return { onCancel };
};
