import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  Form,
  FormProvider,
  FormRadioGroup,
  FormSubmitButton,
} from "metabase/forms";
import { Radio, Stack } from "metabase/ui";
import type { CollectionSyncPreferences } from "metabase-types/api";
import { createMockCollectionItem } from "metabase-types/api/mocks";

import { COLLECTIONS_KEY, TYPE_KEY } from "../../constants";

import { SharedTenantCollectionsList } from "./SharedTenantCollectionsList";

const createMockTenantCollectionItem = (
  overrides?: Partial<ReturnType<typeof createMockCollectionItem>>,
) =>
  createMockCollectionItem({
    model: "collection",
    name: "Tenant Collection",
    can_write: true,
    is_remote_synced: false,
    ...overrides,
  });

const setupEndpoints = ({
  collections = [createMockTenantCollectionItem()],
}: {
  collections?: ReturnType<typeof createMockCollectionItem>[];
} = {}) => {
  fetchMock.get(
    "express:/api/collection/root/items",
    { data: collections },
    { name: "root-items" },
  );
};

interface SetupOpts {
  collections?: ReturnType<typeof createMockCollectionItem>[];
  initialSyncMap?: CollectionSyncPreferences;
  syncType?: "read-only" | "read-write";
}

const setup = ({
  collections = [createMockTenantCollectionItem()],
  initialSyncMap = {},
  syncType = "read-write",
}: SetupOpts = {}) => {
  setupEndpoints({ collections });

  const onSubmit = jest.fn();

  renderWithProviders(
    <FormProvider
      initialValues={{
        [COLLECTIONS_KEY]: initialSyncMap,
        [TYPE_KEY]: syncType,
      }}
      onSubmit={onSubmit}
    >
      <Form>
        <SharedTenantCollectionsList />
        <FormSubmitButton label="Save" />
      </Form>
    </FormProvider>,
  );

  return { onSubmit };
};

// Setup with sync type toggle for testing mode switching behavior
const setupWithSyncTypeToggle = ({
  collections = [createMockTenantCollectionItem()],
  initialSyncMap = {},
  syncType = "read-write",
}: SetupOpts = {}) => {
  setupEndpoints({ collections });

  const onSubmit = jest.fn();

  renderWithProviders(
    <FormProvider
      initialValues={{
        [COLLECTIONS_KEY]: initialSyncMap,
        [TYPE_KEY]: syncType,
      }}
      onSubmit={onSubmit}
    >
      <Form>
        <FormRadioGroup name={TYPE_KEY}>
          <Stack>
            <Radio label="Read-only" value="read-only" />
            <Radio label="Read-write" value="read-write" />
          </Stack>
        </FormRadioGroup>
        <SharedTenantCollectionsList />
        <FormSubmitButton label="Save" />
      </Form>
    </FormProvider>,
  );

  return { onSubmit };
};

describe("SharedTenantCollectionsList", () => {
  beforeEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
  });

  describe("rendering", () => {
    it("should show loading state while fetching", async () => {
      fetchMock.get(
        "express:/api/collection/root/items",
        { data: [] },
        {
          name: "root-items",
          delay: 100,
        },
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
            <SharedTenantCollectionsList />
          </Form>
        </FormProvider>,
      );

      expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    });

    it("should show empty state when no collections exist", async () => {
      setup({ collections: [] });

      await waitFor(() => {
        expect(
          screen.getByText("No shared tenant collections found"),
        ).toBeInTheDocument();
      });
    });

    it("should show error state when API fails", async () => {
      fetchMock.get(
        "express:/api/collection/root/items",
        { status: 500 },
        { name: "root-items" },
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
            <SharedTenantCollectionsList />
          </Form>
        </FormProvider>,
      );

      await waitFor(() => {
        expect(
          screen.getByText("Failed to load shared tenant collections"),
        ).toBeInTheDocument();
      });
    });

    it("should render list of collections", async () => {
      const collections = [
        createMockTenantCollectionItem({ id: 1, name: "Collection A" }),
        createMockTenantCollectionItem({ id: 2, name: "Collection B" }),
      ];

      setup({ collections });

      await waitFor(() => {
        expect(screen.getByText("Collection A")).toBeInTheDocument();
      });
      expect(screen.getByText("Collection B")).toBeInTheDocument();
    });
  });

  describe("toggle state from form values", () => {
    it("should show unchecked when syncMap has false value", async () => {
      setup({
        collections: [createMockTenantCollectionItem({ id: 1 })],
        initialSyncMap: { 1: false },
      });

      await waitFor(() => {
        expect(screen.getByRole("switch")).not.toBeChecked();
      });
    });

    it("should show checked when syncMap has true value", async () => {
      setup({
        collections: [createMockTenantCollectionItem({ id: 1 })],
        initialSyncMap: { 1: true },
      });

      await waitFor(() => {
        expect(screen.getByRole("switch")).toBeChecked();
      });
    });

    it("should show unchecked when collection not in syncMap", async () => {
      setup({
        collections: [createMockTenantCollectionItem({ id: 1 })],
        initialSyncMap: {},
      });

      await waitFor(() => {
        expect(screen.getByRole("switch")).not.toBeChecked();
      });
    });
  });

  describe("deferred save behavior", () => {
    it("should NOT call collection API when toggling", async () => {
      // Set up a mock for collection update that should NOT be called
      fetchMock.put(
        /\/api\/collection\/\d+/,
        { id: 1 },
        { name: "update-collection" },
      );

      setup({
        collections: [createMockTenantCollectionItem({ id: 1 })],
        initialSyncMap: { 1: false },
      });

      await waitFor(() => {
        expect(screen.getByRole("switch")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("switch"));

      // Wait a bit to ensure no API call is made
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(fetchMock.callHistory.called("update-collection")).toBe(false);
    });

    it("should update form state when toggling on", async () => {
      const { onSubmit } = setup({
        collections: [createMockTenantCollectionItem({ id: 42 })],
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
        collections: [createMockTenantCollectionItem({ id: 42 })],
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

    it("should handle multiple collections independently", async () => {
      const { onSubmit } = setup({
        collections: [
          createMockTenantCollectionItem({ id: 1, name: "Collection A" }),
          createMockTenantCollectionItem({ id: 2, name: "Collection B" }),
        ],
        initialSyncMap: { 1: false, 2: false },
      });

      await waitFor(() => {
        expect(screen.getByText("Collection A")).toBeInTheDocument();
      });

      const switches = screen.getAllByRole("switch");
      expect(switches).toHaveLength(2);

      // Toggle only the first collection
      await userEvent.click(switches[0]);
      await userEvent.click(screen.getByText("Save"));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            [COLLECTIONS_KEY]: { 1: true, 2: false },
          }),
          expect.anything(),
        );
      });
    });

    it("should preserve other collections when toggling one", async () => {
      const { onSubmit } = setup({
        collections: [
          createMockTenantCollectionItem({ id: 1, name: "Collection A" }),
          createMockTenantCollectionItem({ id: 2, name: "Collection B" }),
          createMockTenantCollectionItem({ id: 3, name: "Collection C" }),
        ],
        initialSyncMap: { 1: true, 2: false, 3: true },
      });

      await waitFor(() => {
        expect(screen.getByText("Collection B")).toBeInTheDocument();
      });

      const switches = screen.getAllByRole("switch");

      // Toggle the second collection (index 1)
      await userEvent.click(switches[1]);
      await userEvent.click(screen.getByText("Save"));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            [COLLECTIONS_KEY]: { 1: true, 2: true, 3: true },
          }),
          expect.anything(),
        );
      });
    });
  });

  describe("permissions", () => {
    it("should disable toggle when can_write is false", async () => {
      setup({
        collections: [createMockTenantCollectionItem({ can_write: false })],
      });

      await waitFor(() => {
        expect(screen.getByRole("switch")).toBeDisabled();
      });
    });

    it("should enable toggle when can_write is true", async () => {
      setup({
        collections: [createMockTenantCollectionItem({ can_write: true })],
      });

      await waitFor(() => {
        expect(screen.getByRole("switch")).toBeEnabled();
      });
    });

    it("should disable toggle when sync type is read-only", async () => {
      setup({
        collections: [createMockTenantCollectionItem({ can_write: true })],
        syncType: "read-only",
      });

      await waitFor(() => {
        expect(screen.getByRole("switch")).toBeDisabled();
      });
    });

    it("should enable toggle when sync type is read-write and can_write is true", async () => {
      setup({
        collections: [createMockTenantCollectionItem({ can_write: true })],
        syncType: "read-write",
      });

      await waitFor(() => {
        expect(screen.getByRole("switch")).toBeEnabled();
      });
    });
  });

  describe("mode switching", () => {
    it("should reset collection sync state to initial values when switching from read-write to read-only", async () => {
      const { onSubmit } = setupWithSyncTypeToggle({
        collections: [createMockTenantCollectionItem({ id: 1 })],
        initialSyncMap: { 1: false },
        syncType: "read-write",
      });

      // Wait for the component to render
      await waitFor(() => {
        expect(screen.getByRole("switch")).toBeInTheDocument();
      });

      // Toggle the collection sync on
      await userEvent.click(screen.getByRole("switch"));
      expect(screen.getByRole("switch")).toBeChecked();

      // Switch to read-only mode
      await userEvent.click(screen.getByLabelText("Read-only"));

      // The collection sync should be reset to initial value (false)
      await waitFor(() => {
        expect(screen.getByRole("switch")).not.toBeChecked();
      });

      // Submit and verify the collections were reset
      await userEvent.click(screen.getByText("Save"));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            [COLLECTIONS_KEY]: { 1: false },
            [TYPE_KEY]: "read-only",
          }),
          expect.anything(),
        );
      });
    });

    it("should not reset collection sync state when switching from read-only to read-write", async () => {
      const { onSubmit } = setupWithSyncTypeToggle({
        collections: [createMockTenantCollectionItem({ id: 1 })],
        initialSyncMap: { 1: true },
        syncType: "read-only",
      });

      // Wait for the component to render
      await waitFor(() => {
        expect(screen.getByRole("switch")).toBeInTheDocument();
      });

      // Verify initial state is checked
      expect(screen.getByRole("switch")).toBeChecked();

      // Switch to read-write mode
      await userEvent.click(screen.getByLabelText("Read-write"));

      // The collection sync should remain as is
      expect(screen.getByRole("switch")).toBeChecked();

      // Submit and verify the collections were not reset
      await userEvent.click(screen.getByText("Save"));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            [COLLECTIONS_KEY]: { 1: true },
            [TYPE_KEY]: "read-write",
          }),
          expect.anything(),
        );
      });
    });
  });
});
