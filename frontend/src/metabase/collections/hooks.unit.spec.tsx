import { setupCollectionByIdEndpoint } from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import type { Collection, CollectionId } from "metabase-types/api";
import { createMockCollection, createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { useGetDefaultCollectionId } from "./hooks";

const TestComponent = ({
  collectionId,
}: {
  collectionId: CollectionId | null;
}) => {
  const defaultCollectionId = useGetDefaultCollectionId(collectionId);

  return <div>id: {JSON.stringify(defaultCollectionId)}</div>;
};

const user = createMockUser({
  id: 801,
  first_name: "Ash",
  personal_collection_id: 301,
});

const defaultCollections: Collection[] = [
  createMockCollection({ id: 101, name: "My Collection" }),
  createMockCollection({ id: 102, name: "Other Collection" }),
  createMockCollection({
    id: 202,
    name: "Instance Analytics",
    type: "instance-analytics",
    can_write: false,
  }),
  createMockCollection({ id: 203, name: "Custom Reports", can_write: true }),
  createMockCollection({
    id: 301,
    name: "Ash's Personal Collection",
    is_personal: true,
  }),
];

const setup = ({
  collectionId,
  collections,
  hasRootAccess = true,
}: {
  collectionId: CollectionId | null;
  collections: Collection[];
  hasRootAccess?: boolean;
}) => {
  setupCollectionByIdEndpoint({ collections });

  const entitiesState = createMockEntitiesState({
    collections: [
      createMockCollection({
        id: "root",
        name: "Our analytics",
        can_write: hasRootAccess,
      }),
      ...collections,
    ],
  });
  const state = createMockState({ currentUser: user, entities: entitiesState });

  renderWithProviders(<TestComponent collectionId={collectionId} />, {
    storeInitialState: state,
  });
};

describe("enterprise > useGetDefaultCollectionId", () => {
  describe("Regular Collection Source", () => {
    it("should default to the root collection", async () => {
      setup({
        collectionId: null,
        hasRootAccess: true,
        collections: defaultCollections,
      });

      expect(await screen.findByText("id: null")).toBeInTheDocument();
    });

    it("should return the user's personal collection when the user lacks write access to our analytics", async () => {
      setup({
        collectionId: null,
        hasRootAccess: false,
        collections: defaultCollections,
      });

      expect(await screen.findByText("id: 301")).toBeInTheDocument();
    });

    it("should use the passed collection id if the user has access", async () => {
      setup({
        collectionId: 101,
        hasRootAccess: false,
        collections: defaultCollections,
      });

      expect(await screen.findByText("id: 101")).toBeInTheDocument();
    });

    it("should fall back to the root collection if the user doesn't have access to the passed collection", async () => {
      setup({
        collectionId: 101,
        hasRootAccess: true,
        collections: [
          createMockCollection({
            id: 101,
            name: "My Collection",
            can_write: false,
          }),
        ],
      });

      expect(await screen.findByText("id: null")).toBeInTheDocument();
    });

    it("should fall back to the personal collection if the user doesn't have access to the passed collection or the root collection", async () => {
      setup({
        collectionId: 101,
        hasRootAccess: false,
        collections: [
          createMockCollection({
            id: 101,
            name: "My Collection",
            can_write: false,
          }),
        ],
      });

      expect(await screen.findByText("id: 301")).toBeInTheDocument();
    });
  });
});
