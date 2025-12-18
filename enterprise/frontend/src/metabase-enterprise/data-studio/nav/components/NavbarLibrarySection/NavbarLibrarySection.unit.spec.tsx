import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { Collection } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

// Mock isLibraryCollection to return true for collections with type "library"
jest.mock("metabase/collections/utils", () => ({
  ...jest.requireActual("metabase/collections/utils"),
  isLibraryCollection: (collection: { type: string | null }) =>
    collection?.type === "library",
}));

// Mock useGitSyncVisible
const mockUseGitSyncVisible = jest.fn(() => ({
  isVisible: true,
  currentBranch: "main",
}));
jest.mock("metabase-enterprise/remote_sync/hooks/use-git-sync-visible", () => ({
  useGitSyncVisible: () => mockUseGitSyncVisible(),
}));

// Mock useRemoteSyncDirtyState
const mockIsCollectionDirty = jest.fn(
  (_id: number | string | undefined) => false,
);
jest.mock(
  "metabase-enterprise/remote_sync/hooks/use-remote-sync-dirty-state",
  () => ({
    useRemoteSyncDirtyState: () => ({
      isCollectionDirty: mockIsCollectionDirty,
    }),
  }),
);

import { NavbarLibrarySection } from "./NavbarLibrarySection";

const createChildCollection = (
  overrides: Partial<Collection> = {},
): Collection =>
  createMockCollection({
    id: 10,
    name: "Metrics",
    type: null,
    location: "/1/",
    here: ["card"],
    below: ["card"],
    ...overrides,
  } as Partial<Collection>);

const createLibraryCollection = (
  overrides: Partial<Collection> = {},
): Collection =>
  createMockCollection({
    id: 1,
    name: "Library",
    type: "library",
    location: "/",
    here: ["card"],
    below: ["card"],
    ...overrides,
  } as Partial<Collection>);

const setup = ({
  collections = [createLibraryCollection()],
  dirtyCollectionIds = [] as number[],
  isGitSyncVisible = true,
}: {
  collections?: Collection[];
  dirtyCollectionIds?: number[];
  isGitSyncVisible?: boolean;
} = {}) => {
  mockUseGitSyncVisible.mockReturnValue({
    isVisible: isGitSyncVisible,
    currentBranch: "main",
  });
  mockIsCollectionDirty.mockImplementation(
    (id: number | string | undefined) =>
      typeof id === "number" && dirtyCollectionIds.includes(id),
  );

  return renderWithProviders(
    <Route
      path="/"
      component={() => (
        <NavbarLibrarySection
          collections={collections}
          selectedId={undefined}
          onItemSelect={jest.fn()}
        />
      )}
    />,
    {
      storeInitialState: createMockState({
        settings: mockSettings({
          "expand-library-in-nav": true,
        }),
      }),
      withRouter: true,
      withDND: true,
    },
  );
};

describe("NavbarLibrarySection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
  });

  describe("rendering", () => {
    it("should render library subcollections", async () => {
      const libraryCollection = createLibraryCollection({
        children: [createChildCollection({ name: "Metrics" })],
      });
      setup({ collections: [libraryCollection] });

      await waitFor(() => {
        expect(screen.getByText("Metrics")).toBeInTheDocument();
      });
    });

    it("should not render when no library collection exists", () => {
      const regularCollection = createMockCollection({
        id: 2,
        name: "Regular",
        type: null,
      });
      setup({ collections: [regularCollection] });

      expect(screen.queryByText("Library")).not.toBeInTheDocument();
    });
  });

  describe("dirty state badges", () => {
    it("should not show badge when git sync is not visible", async () => {
      const libraryCollection = createLibraryCollection({
        children: [createChildCollection({ id: 10, name: "Metrics" })],
      });
      setup({
        collections: [libraryCollection],
        dirtyCollectionIds: [10],
        isGitSyncVisible: false,
      });

      await waitFor(() => {
        expect(screen.getByText("Metrics")).toBeInTheDocument();
      });

      expect(
        screen.queryByTestId("remote-sync-status"),
      ).not.toBeInTheDocument();
    });

    it("should not show badge when collection has no dirty changes", async () => {
      const libraryCollection = createLibraryCollection({
        children: [createChildCollection({ id: 10, name: "Metrics" })],
      });
      setup({
        collections: [libraryCollection],
        dirtyCollectionIds: [],
        isGitSyncVisible: true,
      });

      await waitFor(() => {
        expect(screen.getByText("Metrics")).toBeInTheDocument();
      });

      expect(
        screen.queryByTestId("remote-sync-status"),
      ).not.toBeInTheDocument();
    });

    it("should show badge when collection has dirty changes and git sync is visible", async () => {
      const libraryCollection = createLibraryCollection({
        children: [createChildCollection({ id: 10, name: "Metrics" })],
      });
      setup({
        collections: [libraryCollection],
        dirtyCollectionIds: [10],
        isGitSyncVisible: true,
      });

      await waitFor(() => {
        expect(screen.getByText("Metrics")).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByTestId("remote-sync-status")).toBeInTheDocument();
      });
    });

    it("should show badge only for collections with changes", async () => {
      const libraryCollection = createLibraryCollection({
        children: [
          createChildCollection({ id: 10, name: "Dirty Collection" }),
          createChildCollection({ id: 11, name: "Clean Collection" }),
        ],
      });
      setup({
        collections: [libraryCollection],
        dirtyCollectionIds: [10],
        isGitSyncVisible: true,
      });

      await waitFor(() => {
        expect(screen.getByText("Dirty Collection")).toBeInTheDocument();
      });
      expect(screen.getByText("Clean Collection")).toBeInTheDocument();

      await waitFor(() => {
        const badges = screen.getAllByTestId("remote-sync-status");
        expect(badges).toHaveLength(1);
      });
    });
  });
});
