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

    it("should render a user-created top-level folder with its custom icon", async () => {
      const libraryCollection = createLibraryCollection({
        children: [
          createChildCollection({ name: "Metrics" }),
          createMockCollection({
            id: 42,
            name: "Finance",
            type: "library",
            is_library_root: false,
            icon: "gem",
            location: "/1/",
          }),
        ],
      });
      setup({ collections: [libraryCollection] });

      await waitFor(() => {
        expect(screen.getByText("Finance")).toBeInTheDocument();
      });
      expect(screen.getByLabelText("gem icon")).toBeInTheDocument();
    });

    it("should fall back to the folder icon when none is set", async () => {
      const libraryCollection = createLibraryCollection({
        children: [
          createMockCollection({
            id: 42,
            name: "Finance",
            type: "library",
            is_library_root: false,
            location: "/1/",
          }),
        ],
      });
      setup({ collections: [libraryCollection] });

      await waitFor(() => {
        expect(screen.getByText("Finance")).toBeInTheDocument();
      });
      expect(screen.getByLabelText("folder icon")).toBeInTheDocument();
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
});
