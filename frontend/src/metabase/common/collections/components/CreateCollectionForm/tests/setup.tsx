/* istanbul ignore file */
import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders } from "__support__/ui";
import { Route } from "metabase/router";
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

export interface SetupOpts {
  user?: User;
  tokenFeatures?: TokenFeatures;
  showAuthorityLevelPicker?: boolean;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  parentCollectionNamespace?: CollectionNamespace | null;
  initialCollectionId?: CollectionId;
  namespaces?: CollectionNamespace[];
  canWriteRoot?: boolean;
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
  canWriteRoot = true,
  onSubmit = jest.fn(),
}: SetupOpts = {}) => {
  const rootCollection = createMockCollection({
    id: "root",
    name: "Our analytics",
    can_write: canWriteRoot,
  });
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
    : rootCollection;

  const collections =
    parentCollectionNamespace !== undefined
      ? [rootCollection, parentCollection]
      : [rootCollection];

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
    rootCollection: rootCollection,
  });

  // Mock individual collection fetches
  setupCollectionByIdEndpoint({
    collections: endpointCollections,
  });

  renderWithProviders(
    <Route
      path="/"
      element={
        <CreateCollectionForm
          onCancel={onCancel}
          onSubmit={onSubmit}
          showAuthorityLevelPicker={showAuthorityLevelPicker}
          collectionId={parentCollectionNamespace !== undefined ? 1 : undefined}
          initialCollectionId={initialCollectionId}
          namespaces={namespaces}
        />
      }
    />,
    {
      withRouter: true,
      storeInitialState: createMockState({
        currentUser: user,
        settings,
      }),
    },
  );

  return { onCancel, onSubmit };
};
