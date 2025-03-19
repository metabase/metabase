import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type { Collection } from "metabase-types/api";
import {
  createMockCollection,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockEntityId } from "metabase-types/api/mocks/entity-id";
import { createMockState } from "metabase-types/store/mocks";

import { CollectionInfoSidebar } from "../CollectionInfoSidebar";

export const setup = ({
  collection,
  enableEnterprisePlugins,
  enableOfficialCollections = false,
  enableSerialization = false,
}: {
  collection: Collection;
  enableEnterprisePlugins?: boolean;
  enableOfficialCollections: boolean;
  enableSerialization?: boolean;
}) => {
  const state = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({
        serialization: enableSerialization,
        official_collections: enableOfficialCollections,
      }),
    }),
  });
  if (enableEnterprisePlugins) {
    setupEnterprisePlugins();
  }
  return renderWithProviders(
    <>
      {collection.name}
      <CollectionInfoSidebar
        collection={collection}
        onClose={jest.fn()}
        onUpdateCollection={jest.fn()}
      />
    </>,
    {
      storeInitialState: state,
    },
  );
};

export const regularCollection = createMockCollection({
  name: "Normal collection",
  description: "Description of a normal collection",
  entity_id: createMockEntityId("entity_id_of_normal_collection"),
  authority_level: null,
});

export const officialCollection = createMockCollection({
  name: "Trusted collection",
  description: "Description of a trusted collection",
  entity_id: createMockEntityId("entity_id_of_trusted_collection"),
  authority_level: "official",
});
