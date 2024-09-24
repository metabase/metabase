import { renderWithProviders, screen } from "__support__/ui";
import type { Collection } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";

import { CollectionInfoSidebar } from "./CollectionInfoSidebar";

const setup = ({
  collection,
  enableOfficialCollections = false,
}: {
  collection: Collection;
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
    },
  );
};

describe("CollectionInfoSidebar", () => {
  const regularCollection = createMockCollection({
    name: "Normal collection",
    description: "Description of a normal collection",
    entity_id: "entity_id_of_normal_collection",
    authority_level: null,
  });
  const officialCollection = createMockCollection({
    name: "Trusted collection",
    description: "Description of a trusted collection",
    entity_id: "entity_id_of_trusted_collection",
    authority_level: "official",
  });
  describe("with official collections disabled", () => {
    it("should render for a regular collection", async () => {
      setup({
        collection: regularCollection,
        enableOfficialCollections: false,
      });
      expect(await screen.findByText("Normal collection")).toBeInTheDocument();
      expect(
        await screen.findByText("Description of a normal collection"),
      ).toBeInTheDocument();
      expect(
        await screen.findByText("entity_id_of_normal_collection"),
      ).toBeInTheDocument();
      expect(screen.queryByText("Official collection")).not.toBeInTheDocument();
    });
    it("should render properly for an official collection", async () => {
      setup({
        collection: officialCollection,
        enableOfficialCollections: false,
      });
      expect(await screen.findByText("Trusted collection")).toBeInTheDocument();
      expect(
        await screen.findByText("Description of a trusted collection"),
      ).toBeInTheDocument();
      expect(
        await screen.findByText("entity_id_of_trusted_collection"),
      ).toBeInTheDocument();
      expect(screen.queryByText("Official collection")).not.toBeInTheDocument();
    });
  });

  describe("with official collections enabled", () => {
    it("should render a regular collection properly", async () => {
      setup({ collection: regularCollection, enableOfficialCollections: true });
      expect(
        await screen.findByText(regularCollection.name),
      ).toBeInTheDocument();
      expect(
        await screen.findByText("Description of a normal collection"),
      ).toBeInTheDocument();
      expect(
        await screen.findByText("entity_id_of_normal_collection"),
      ).toBeInTheDocument();
      expect(screen.queryByText("Official collection")).not.toBeInTheDocument();
    });

    it("should render an official collection properly", async () => {
      setup({
        collection: officialCollection,
        enableOfficialCollections: true,
      });
      expect(await screen.findByText("Trusted collection")).toBeInTheDocument();
      expect(
        await screen.findByText("Description of a trusted collection"),
      ).toBeInTheDocument();
      expect(
        await screen.findByText("entity_id_of_trusted_collection"),
      ).toBeInTheDocument();
      expect(
        await screen.findByText("Official collection"),
      ).toBeInTheDocument();
    });
  });
});
