import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { Form, FormProvider, FormSubmitButton } from "metabase/forms";
import type { CollectionSyncPreferences } from "metabase-types/api";
import {
  createMockCollectionItem,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { COLLECTIONS_KEY, TYPE_KEY } from "../../constants";

import { TopLevelCollectionsList } from "./TopLevelCollectionsList";

const createMockTopLevelCollectionItem = (
  overrides?: Partial<ReturnType<typeof createMockCollectionItem>>,
) =>
  createMockCollectionItem({
    model: "collection",
    name: "Top Level Collection",
    can_write: true,
    is_remote_synced: false,
    ...overrides,
  });

const createMockLibraryCollection = (
  overrides?: Partial<ReturnType<typeof createMockCollectionItem>>,
) =>
  createMockCollectionItem({
    id: 999,
    model: "collection",
    name: "Library",
    can_write: true,
    is_remote_synced: false,
    type: "library",
    ...overrides,
  });

const setupEndpoints = ({
  collections = [createMockTopLevelCollectionItem()],
  libraryCollection = null as ReturnType<
    typeof createMockCollectionItem
  > | null,
}: {
  collections?: ReturnType<typeof createMockCollectionItem>[];
  libraryCollection?: ReturnType<typeof createMockCollectionItem> | null;
} = {}) => {
  fetchMock.get(
    "express:/api/collection/root/items",
    { data: collections },
    { name: "root-items" },
  );

  fetchMock.get(
    "express:/api/ee/library",
    libraryCollection ?? { data: null },
    { name: "library" },
  );
};

interface SetupOpts {
  collections?: ReturnType<typeof createMockCollectionItem>[];
  libraryCollection?: ReturnType<typeof createMockCollectionItem> | null;
  initialSyncMap?: CollectionSyncPreferences;
  syncType?: "read-only" | "read-write";
}

const setup = ({
  collections = [createMockTopLevelCollectionItem()],
  libraryCollection = null,
  initialSyncMap = {},
  syncType = "read-write",
}: SetupOpts = {}) => {
  setupEndpoints({ collections, libraryCollection });

  const onSubmit = jest.fn();

  const settings = mockSettings({
    "token-features": createMockTokenFeatures(),
  });
  const state = createMockState({
    settings,
  });

  const enterprisePlugins: ENTERPRISE_PLUGIN_NAME[] = ["transforms"];
  enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);

  renderWithProviders(
    <FormProvider
      initialValues={{
        [COLLECTIONS_KEY]: initialSyncMap,
        [TYPE_KEY]: syncType,
      }}
      onSubmit={onSubmit}
    >
      <Form>
        <TopLevelCollectionsList />
        <FormSubmitButton label="Save" />
      </Form>
    </FormProvider>,
    {
      storeInitialState: state,
    },
  );

  return { onSubmit };
};

describe("TopLevelCollectionsList", () => {
  beforeEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
  });

  describe("rendering", () => {
    it("should show loading state while fetching", async () => {
      fetchMock.get(
        "express:/api/collection/root/items",
        { data: [] },
        { name: "root-items", delay: 100 },
      );
      fetchMock.get(
        "express:/api/ee/library",
        { data: null },
        { name: "library", delay: 100 },
      );

      renderWithProviders(
        <FormProvider
          initialValues={{
            [COLLECTIONS_KEY]: {},
            [TYPE_KEY]: "read-write",
          }}
          onSubmit={jest.fn()}
        >
          <Form>
            <TopLevelCollectionsList />
          </Form>
        </FormProvider>,
      );

      expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    });

    it("should show empty state when no collections exist", async () => {
      setup({ collections: [], libraryCollection: null });

      await waitFor(() => {
        expect(screen.getByText("No collections found")).toBeInTheDocument();
      });
    });

    it("should show error state when API fails", async () => {
      fetchMock.get(
        "express:/api/collection/root/items",
        { status: 500 },
        { name: "root-items" },
      );
      fetchMock.get(
        "express:/api/ee/library",
        { data: null },
        { name: "library" },
      );

      renderWithProviders(
        <FormProvider
          initialValues={{
            [COLLECTIONS_KEY]: {},
            [TYPE_KEY]: "read-write",
          }}
          onSubmit={jest.fn()}
        >
          <Form>
            <TopLevelCollectionsList />
          </Form>
        </FormProvider>,
      );

      await waitFor(() => {
        expect(
          screen.getByText("Failed to load collections"),
        ).toBeInTheDocument();
      });
    });

    it("should render list of collections", async () => {
      const collections = [
        createMockTopLevelCollectionItem({ id: 1, name: "Collection A" }),
        createMockTopLevelCollectionItem({ id: 2, name: "Collection B" }),
      ];

      setup({ collections });

      await waitFor(() => {
        expect(screen.getByText("Collection A")).toBeInTheDocument();
      });
      expect(screen.getByText("Collection B")).toBeInTheDocument();
    });
  });

  describe("filtering", () => {
    it("should filter out personal collections", async () => {
      const collections = [
        createMockTopLevelCollectionItem({ id: 1, name: "Team Collection" }),
        createMockTopLevelCollectionItem({
          id: 2,
          name: "Personal Collection",
          personal_owner_id: 123,
        }),
      ];

      setup({ collections });

      await waitFor(() => {
        expect(screen.getByText("Team Collection")).toBeInTheDocument();
      });

      expect(screen.queryByText("Personal Collection")).not.toBeInTheDocument();
    });

    it("should filter out instance-analytics collections", async () => {
      const collections = [
        createMockTopLevelCollectionItem({ id: 1, name: "Team Collection" }),
        createMockTopLevelCollectionItem({
          id: 2,
          name: "Usage Analytics",
          type: "instance-analytics",
        }),
      ];

      setup({ collections });

      await waitFor(() => {
        expect(screen.getByText("Team Collection")).toBeInTheDocument();
      });

      expect(screen.queryByText("Usage Analytics")).not.toBeInTheDocument();
    });

    it("should filter out both personal and analytics collections", async () => {
      const collections = [
        createMockTopLevelCollectionItem({ id: 1, name: "Team Collection" }),
        createMockTopLevelCollectionItem({
          id: 2,
          name: "Personal Collection",
          personal_owner_id: 123,
        }),
        createMockTopLevelCollectionItem({
          id: 3,
          name: "Usage Analytics",
          type: "instance-analytics",
        }),
      ];

      setup({ collections });

      await waitFor(() => {
        expect(screen.getByText("Team Collection")).toBeInTheDocument();
      });

      expect(screen.queryByText("Personal Collection")).not.toBeInTheDocument();
      expect(screen.queryByText("Usage Analytics")).not.toBeInTheDocument();
    });
  });

  describe("library collection", () => {
    it("should include library collection when it exists", async () => {
      const collections = [
        createMockTopLevelCollectionItem({ id: 1, name: "Regular Collection" }),
      ];
      const libraryCollection = createMockLibraryCollection();

      setup({ collections, libraryCollection });

      await waitFor(() => {
        expect(screen.getByText("Library")).toBeInTheDocument();
      });
      expect(screen.getByText("Regular Collection")).toBeInTheDocument();
    });

    it("should show library collection first in the list", async () => {
      const collections = [
        createMockTopLevelCollectionItem({ id: 1, name: "A Collection" }),
      ];
      const libraryCollection = createMockLibraryCollection();

      setup({ collections, libraryCollection });

      await waitFor(() => {
        expect(screen.getByText("Library")).toBeInTheDocument();
      });

      const switches = screen.getAllByRole("switch");
      expect(switches).toHaveLength(2);

      // Library should be first (based on the order in the DOM)
      const collectionNames = screen
        .getAllByText(/Library|A Collection/)
        .map((el) => el.textContent);
      expect(collectionNames[0]).toBe("Library");
    });

    it("should work without library collection", async () => {
      const collections = [
        createMockTopLevelCollectionItem({ id: 1, name: "Collection A" }),
      ];

      setup({ collections, libraryCollection: null });

      await waitFor(() => {
        expect(screen.getByText("Collection A")).toBeInTheDocument();
      });

      expect(screen.queryByText("Library")).not.toBeInTheDocument();
    });
  });

  describe("toggle state from form values", () => {
    it("should show unchecked when syncMap has false value", async () => {
      setup({
        collections: [createMockTopLevelCollectionItem({ id: 1 })],
        initialSyncMap: { 1: false },
      });

      await waitFor(() => {
        expect(screen.getByRole("switch")).not.toBeChecked();
      });
    });

    it("should show checked when syncMap has true value", async () => {
      setup({
        collections: [createMockTopLevelCollectionItem({ id: 1 })],
        initialSyncMap: { 1: true },
      });

      await waitFor(() => {
        expect(screen.getByRole("switch")).toBeChecked();
      });
    });
  });

  describe("deferred save behavior", () => {
    it("should update form state when toggling on", async () => {
      const { onSubmit } = setup({
        collections: [createMockTopLevelCollectionItem({ id: 42 })],
        initialSyncMap: { 42: false },
      });

      await waitFor(() => {
        expect(screen.getByRole("switch")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("switch"));
      await userEvent.click(screen.getByText("Save"));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            [COLLECTIONS_KEY]: { 42: true },
          }),
          expect.anything(),
        );
      });
    });

    it("should update form state when toggling off", async () => {
      const { onSubmit } = setup({
        collections: [createMockTopLevelCollectionItem({ id: 42 })],
        initialSyncMap: { 42: true },
      });

      await waitFor(() => {
        expect(screen.getByRole("switch")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("switch"));
      await userEvent.click(screen.getByText("Save"));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            [COLLECTIONS_KEY]: { 42: false },
          }),
          expect.anything(),
        );
      });
    });

    it("should handle toggling library collection", async () => {
      const libraryCollection = createMockLibraryCollection({ id: 999 });
      const { onSubmit } = setup({
        collections: [],
        libraryCollection,
        initialSyncMap: { 999: false },
      });

      await waitFor(() => {
        expect(screen.getByRole("switch")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("switch"));
      await userEvent.click(screen.getByText("Save"));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            [COLLECTIONS_KEY]: { 999: true },
          }),
          expect.anything(),
        );
      });
    });
  });

  describe("permissions", () => {
    it("should disable toggle when can_write is false", async () => {
      setup({
        collections: [createMockTopLevelCollectionItem({ can_write: false })],
      });

      await waitFor(() => {
        expect(screen.getByRole("switch")).toBeDisabled();
      });
    });

    it("should enable toggle when can_write is true", async () => {
      setup({
        collections: [createMockTopLevelCollectionItem({ can_write: true })],
      });

      await waitFor(() => {
        expect(screen.getByRole("switch")).toBeEnabled();
      });
    });

    it("should disable toggle when sync type is read-only", async () => {
      setup({
        collections: [createMockTopLevelCollectionItem({ can_write: true })],
        syncType: "read-only",
      });

      await waitFor(() => {
        expect(screen.getByRole("switch")).toBeDisabled();
      });
    });
  });
});
