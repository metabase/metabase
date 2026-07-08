/* istanbul ignore file */
import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type {
  CollectionId,
  CollectionNamespace,
  TokenFeatures,
  User,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

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
  initialCollectionId?: CollectionId;
  namespaces?: CollectionNamespace[];
  onSubmit?: jest.Mock;
}

export const setup = ({
  user = createMockUser({ is_superuser: true }),
  tokenFeatures = createMockTokenFeatures(),
  showAuthorityLevelPicker,
  enterprisePlugins,
  parentCollectionNamespace,
  initialCollectionId,
  namespaces,
  onSubmit = jest.fn(),
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

  const initialCollection = initialCollectionId
    ? createMockCollection({
        id: initialCollectionId,
        name: "Data",
        can_write: true,
        namespace: parentCollectionNamespace,
      })
    : null;
  const endpointCollections = initialCollection
    ? [...collections, initialCollection]
    : collections;

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
    collections: endpointCollections,
  });

  renderWithProviders(
    <CreateCollectionForm
      onCancel={onCancel}
      onSubmit={onSubmit}
      showAuthorityLevelPicker={showAuthorityLevelPicker}
      collectionId={parentCollectionNamespace !== undefined ? 1 : undefined}
      initialCollectionId={initialCollectionId}
      namespaces={namespaces}
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

  return { onCancel, onSubmit };
};
