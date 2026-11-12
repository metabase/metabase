import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupCollectionItemsEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders } from "__support__/ui";
import { Route } from "metabase/router";
import type { Collection, CollectionItem } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockEntityId } from "metabase-types/api/mocks/entity-id";

import { CollectionInfoSidebar } from "../CollectionInfoSidebar";

export type SetupOpts = {
  collection: Collection;
  collectionItems?: CollectionItem[];
  enableEnterprisePlugins?: boolean;
  enableRemoteSync: boolean;
  enableSerialization?: boolean;
  withFilterByType?: boolean;
};

export const setup = ({
  collection,
  collectionItems = defaultCollectionItems,
  enableEnterprisePlugins,
  enableRemoteSync = false,
  enableSerialization = false,
  withFilterByType = true,
}: SetupOpts) => {
  const state = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({
        serialization: enableSerialization,
        remote_sync: enableRemoteSync,
      }),
    }),
  });
  if (enableEnterprisePlugins) {
    setupEnterprisePlugins();
  }
  setupCollectionItemsEndpoint({ collection, collectionItems });
  const onClose = jest.fn();
  const onFilterByType = jest.fn();

  const view = renderWithProviders(
    <Route
      path="*"
      element={
        <>
          {collection.name}
          <CollectionInfoSidebar
            collection={collection}
            onClose={onClose}
            onUpdateCollection={jest.fn()}
            onFilterByType={withFilterByType ? onFilterByType : undefined}
          />
        </>
      }
    />,
    { storeInitialState: state, withRouter: true },
  );

  return { ...view, onClose, onFilterByType };
};

export const regularCollection = createMockCollection({
  name: "Normal collection",
  description: "Description of a normal collection",
  entity_id: createMockEntityId("entity_id_of_normal_collection"),
});

export const officialCollection = createMockCollection({
  name: "Trusted collection",
  description: "Description of a trusted collection",
  entity_id: createMockEntityId("entity_id_of_trusted_collection"),
  is_remote_synced: true,
});

export const defaultCollectionItems: CollectionItem[] = [
  createMockCollectionItem({ id: 1, model: "dashboard", name: "Dashboard A" }),
  createMockCollectionItem({ id: 2, model: "dashboard", name: "Dashboard B" }),
  createMockCollectionItem({ id: 3, model: "card", name: "Question A" }),
  createMockCollectionItem({ id: 4, model: "collection", name: "Child" }),
];
