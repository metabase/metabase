import fetchMock from "fetch-mock";

import { screen, waitFor } from "__support__/ui";
import { createMockCollection } from "metabase-types/api/mocks";

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

      fetchMock.get("path:/api/ee/remote-sync/dirty", {
        dirty: [
          {
            collection_id: 10,
          },
        ],
      });

      setup({
        isEnterprise: true,
        collections: [libraryCollection],
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

      fetchMock.get("path:/api/ee/remote-sync/dirty", {
        dirty: [
          {
            collection_id: 10,
          },
        ],
      });

      setup({
        isEnterprise: true,
        collections: [libraryCollection],
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
