import { renderWithProviders } from "__support__/ui";
import type { Collection } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";

import { CollectionInfoSidebar } from "../CollectionInfoSidebar";

export const setup = ({
  collection,
  enableEnterprisePlugins,
  enableOfficialCollections = false,
}: {
  collection: Collection;
  enableEnterprisePlugins?: boolean;
  enableOfficialCollections: boolean;
}) => {
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
      withFeatures: enableOfficialCollections
        ? ["official_collections" as const]
        : [],
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
