import fetchMock from "fetch-mock";

import { screen, waitFor } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import {
  createMockCollection,
  createMockRemoteSyncCardData,
  createMockRemoteSyncDirtyItem,
} from "metabase-types/api/mocks";

import { createChildCollection, createLibraryCollection, setup } from "./setup";

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

    it("should render custom icons for library sections with promoted children", async () => {
      const libraryCollection = createLibraryCollection();
      const dataCollection = createChildCollection({
        id: 10,
        name: "Data Child",
        type: "library-data",
        is_library_root: false,
      });
      const metricsCollection = createChildCollection({
        id: 11,
        name: "Metrics Child",
        type: "library-metrics",
        is_library_root: false,
      });

      setup({
        collections: [libraryCollection, dataCollection, metricsCollection],
      });

      await waitFor(() => {
        expect(screen.getByText("Data")).toBeInTheDocument();
        expect(screen.getByText("Metrics")).toBeInTheDocument();
      });

      expect(screen.getByLabelText("table icon")).toBeInTheDocument();
      expect(screen.getByLabelText("metric icon")).toBeInTheDocument();
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

  describe("unpushed changes", () => {
    afterEach(() => {
      reinitialize();
    });

    it("marks collections with unpushed changes", async () => {
      const libraryCollection = createLibraryCollection({
        children: [
          createChildCollection({
            id: 10,
            name: "Dirty Collection",
            type: "library-metrics",
          }),
          createChildCollection({
            id: 11,
            name: "Clean Collection",
            type: "library-data",
          }),
        ],
      });

      setup({
        isEnterprise: true,
        collections: [libraryCollection],
        dirty: [
          createMockRemoteSyncDirtyItem({
            model: "card",
            data: createMockRemoteSyncCardData({
              collection_id: 10,
              collection: createMockCollection({ id: 10 }),
            }),
          }),
        ],
      });

      expect(await screen.findByText("Dirty Collection")).toBeInTheDocument();
      expect(screen.getByText("Clean Collection")).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getAllByTestId("remote-sync-status")).toHaveLength(1),
      );
    });

    it("marks nothing without remote sync", async () => {
      setup({
        collections: [
          createLibraryCollection({
            children: [createChildCollection({ id: 10, name: "Metrics" })],
          }),
        ],
        dirty: [
          createMockRemoteSyncDirtyItem({
            model: "card",
            data: createMockRemoteSyncCardData({
              collection_id: 10,
              collection: createMockCollection({ id: 10 }),
            }),
          }),
        ],
      });

      expect(await screen.findByText("Metrics")).toBeInTheDocument();
      expect(
        screen.queryByTestId("remote-sync-status"),
      ).not.toBeInTheDocument();
    });
  });
});
