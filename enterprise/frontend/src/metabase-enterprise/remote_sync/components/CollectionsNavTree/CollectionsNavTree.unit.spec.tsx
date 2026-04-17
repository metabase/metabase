import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { Collection } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

// Mock useRemoteSyncDirtyState
const mockIsCollectionDirty = jest.fn(
  (_id: number | string | undefined) => false,
);
jest.mock("../../hooks/use-remote-sync-dirty-state", () => ({
  useRemoteSyncDirtyState: () => ({
    isCollectionDirty: mockIsCollectionDirty,
  }),
}));

import { CollectionsNavTree } from "./CollectionsNavTree";

const createMockCollectionTreeItem = (
  overrides: Partial<Collection> = {},
): Collection => ({
  ...createMockCollection({
    id: 1,
    name: "Test Collection",
    is_remote_synced: false,
    ...overrides,
  }),
});

const setupEndpoints = ({
  collections = [createMockCollectionTreeItem()],
}: {
  collections?: Collection[];
} = {}) => {
  fetchMock.get("path:/api/collection", collections);
};

const setup = ({
  collections = [createMockCollectionTreeItem()],
  collectionsList = [createMockCollectionTreeItem()],
  dirtyCollectionIds = [] as number[],
}: {
  collections?: Collection[];
  collectionsList?: Collection[];
  dirtyCollectionIds?: number[];
} = {}) => {
  setupEndpoints({ collections: collectionsList });

  // Configure mock to return true for dirty collection IDs
  mockIsCollectionDirty.mockImplementation(
    (id: number | string | undefined) =>
      typeof id === "number" && dirtyCollectionIds.includes(id),
  );

  return renderWithProviders(
    <Route
      path="/"
      component={() => (
        <CollectionsNavTree
          collections={collections as any}
          selectedId={undefined}
          onSelect={jest.fn()}
        />
      )}
    />,
    {
      storeInitialState: createMockState({
        settings: mockSettings({}),
      }),
      withDND: true,
      withRouter: true,
    },
  );
};

describe("CollectionsNavTree", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
    mockIsCollectionDirty.mockReturnValue(false);
  });

  describe("rendering", () => {
    it("should render collections tree", async () => {
      const collection = createMockCollectionTreeItem({
        name: "My Collection",
      });
      setup({ collections: [collection] });

      await waitFor(() => {
        expect(screen.getByText("My Collection")).toBeInTheDocument();
      });
    });

    it("should render multiple collections", async () => {
      const collection1 = createMockCollectionTreeItem({
        id: 1,
        name: "Collection 1",
      });
      const collection2 = createMockCollectionTreeItem({
        id: 2,
        name: "Collection 2",
      });
      setup({ collections: [collection1, collection2] });

      await waitFor(() => {
        expect(screen.getByText("Collection 1")).toBeInTheDocument();
      });
      expect(screen.getByText("Collection 2")).toBeInTheDocument();
    });
  });

  describe("dirty state badges", () => {
    it("should not show badge when no collections are remote-synced", async () => {
      const collection = createMockCollectionTreeItem({
        id: 1,
        name: "Regular Collection",
        is_remote_synced: false,
      });
      setup({
        collections: [collection],
        collectionsList: [collection],
        dirtyCollectionIds: [1],
      });

      await waitFor(() => {
        expect(screen.getByText("Regular Collection")).toBeInTheDocument();
      });

      // Badge should not be present since collection is not remote-synced
      expect(
        screen.queryByTestId("remote-sync-status"),
      ).not.toBeInTheDocument();
    });

    it("should show badge when collection has dirty changes and is remote-synced", async () => {
      const collection = createMockCollectionTreeItem({
        id: 1,
        name: "Synced Collection",
        is_remote_synced: true,
      });
      setup({
        collections: [collection],
        collectionsList: [collection],
        dirtyCollectionIds: [1],
      });

      await waitFor(() => {
        expect(screen.getByText("Synced Collection")).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByTestId("remote-sync-status")).toBeInTheDocument();
      });
    });

    it("should not show badge for collection without dirty changes", async () => {
      const syncedCollection = createMockCollectionTreeItem({
        id: 1,
        name: "Clean Synced Collection",
        is_remote_synced: true,
      });
      setup({
        collections: [syncedCollection],
        collectionsList: [syncedCollection],
        dirtyCollectionIds: [],
      });

      await waitFor(() => {
        expect(screen.getByText("Clean Synced Collection")).toBeInTheDocument();
      });

      // Badge should not be present since there are no dirty changes
      expect(
        screen.queryByTestId("remote-sync-status"),
      ).not.toBeInTheDocument();
    });

    it("should show badge only for collections with changes", async () => {
      const dirtyCollection = createMockCollectionTreeItem({
        id: 1,
        name: "Dirty Collection",
        is_remote_synced: true,
      });
      const cleanCollection = createMockCollectionTreeItem({
        id: 2,
        name: "Clean Collection",
        is_remote_synced: true,
      });
      setup({
        collections: [dirtyCollection, cleanCollection],
        collectionsList: [dirtyCollection, cleanCollection],
        dirtyCollectionIds: [1],
      });

      await waitFor(() => {
        expect(screen.getByText("Dirty Collection")).toBeInTheDocument();
      });
      expect(screen.getByText("Clean Collection")).toBeInTheDocument();

      await waitFor(() => {
        // Only one badge should be present
        const badges = screen.getAllByTestId("remote-sync-status");
        expect(badges).toHaveLength(1);
      });
    });
  });
});
