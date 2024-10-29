import { renderWithProviders } from "__support__/ui";
import type { Collection, TokenFeature } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";

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
  const withFeatures: TokenFeature[] = [];
  if (enableOfficialCollections) {
    withFeatures.push("official_collections");
  }
  if (enableSerialization) {
    withFeatures.push("serialization");
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
      withFeatures,
      shouldSetupEnterprisePlugins: enableEnterprisePlugins,
    },
  );
};

export const regularCollection = createMockCollection({
  name: "Normal collection",
  description: "Description of a normal collection",
  entity_id: "entity_id_of_normal_collection",
  authority_level: null,
});

export const officialCollection = createMockCollection({
  name: "Trusted collection",
  description: "Description of a trusted collection",
  entity_id: "entity_id_of_trusted_collection",
  authority_level: "official",
});
