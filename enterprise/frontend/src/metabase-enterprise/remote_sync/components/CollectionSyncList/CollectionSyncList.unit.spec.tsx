import userEvent from "@testing-library/user-event";
import React from "react";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  Form,
  FormProvider,
  FormRadioGroup,
  FormSubmitButton,
} from "metabase/forms";
import { Radio, Stack } from "metabase/ui";
import type {
  CollectionItem,
  CollectionSyncPreferences,
} from "metabase-types/api";
import { createMockCollectionItem } from "metabase-types/api/mocks";

import { COLLECTIONS_KEY, TYPE_KEY } from "../../constants";

import { CollectionSyncList } from "./CollectionSyncList";

const createMockCollection = (
  overrides?: Partial<ReturnType<typeof createMockCollectionItem>>,
): CollectionItem =>
  createMockCollectionItem({
    model: "collection",
    name: "Test Collection",
    can_write: true,
    is_remote_synced: false,
    ...overrides,
  });

interface SetupOpts {
  collections?: CollectionItem[];
  isLoading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  initialSyncMap?: CollectionSyncPreferences;
  syncType?: "read-only" | "read-write";
}

const setup = ({
  collections = [createMockCollection()],
  isLoading = false,
  error = null,
  emptyMessage = "No collections found",
  initialSyncMap = {},
  syncType = "read-write",
}: SetupOpts = {}) => {
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
        <CollectionSyncList
          collections={collections}
          isLoading={isLoading}
          error={error}
          emptyMessage={emptyMessage}
        />
        <FormSubmitButton label="Save" />
      </Form>
    </FormProvider>,
  );

  return { onSubmit };
};

const setupWithSyncTypeToggle = ({
  collections = [createMockCollection()],
  isLoading = false,
  error = null,
  emptyMessage = "No collections found",
  initialSyncMap = {},
  syncType = "read-write",
}: SetupOpts = {}) => {
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
        <CollectionSyncList
          collections={collections}
          isLoading={isLoading}
          error={error}
          emptyMessage={emptyMessage}
        />
        <FormSubmitButton label="Save" />
      </Form>
    </FormProvider>,
  );

  return { onSubmit };
};

describe("CollectionSyncList", () => {
  describe("rendering states", () => {
    it("should show loading state when isLoading is true", () => {
      setup({ isLoading: true });

      expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    });

    it("should show empty message when collections array is empty", () => {
      setup({ collections: [], emptyMessage: "Custom empty message" });

      expect(screen.getByText("Custom empty message")).toBeInTheDocument();
    });

    it("should show error message when error is provided", () => {
      setup({ error: "Custom error" });

      expect(screen.getByText("Custom error")).toBeInTheDocument();
    });

    it("should render collections when provided", () => {
      setup({
        collections: [
          createMockCollection({ id: 1, name: "Collection A" }),
          createMockCollection({ id: 2, name: "Collection B" }),
        ],
      });

      expect(screen.getByText("Collection A")).toBeInTheDocument();
      expect(screen.getByText("Collection B")).toBeInTheDocument();
    });
  });

  describe("toggle state from form values", () => {
    it("should show unchecked when syncMap has false value", () => {
      setup({
        collections: [createMockCollection({ id: 1 })],
        initialSyncMap: { 1: false },
      });

      expect(screen.getByRole("switch")).not.toBeChecked();
    });

    it("should show checked when syncMap has true value", () => {
      setup({
        collections: [createMockCollection({ id: 1 })],
        initialSyncMap: { 1: true },
      });

      expect(screen.getByRole("switch")).toBeChecked();
    });

    it("should show unchecked when collection not in syncMap", () => {
      setup({
        collections: [createMockCollection({ id: 1 })],
        initialSyncMap: {},
      });

      expect(screen.getByRole("switch")).not.toBeChecked();
    });
  });

  describe("toggle behavior", () => {
    it("should update form state when toggling on", async () => {
      const { onSubmit } = setup({
        collections: [createMockCollection({ id: 42 })],
        initialSyncMap: { 42: false },
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
        collections: [createMockCollection({ id: 42 })],
        initialSyncMap: { 42: true },
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
          createMockCollection({ id: 1, name: "Collection A" }),
          createMockCollection({ id: 2, name: "Collection B" }),
        ],
        initialSyncMap: { 1: false, 2: false },
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
          createMockCollection({ id: 1, name: "Collection A" }),
          createMockCollection({ id: 2, name: "Collection B" }),
          createMockCollection({ id: 3, name: "Collection C" }),
        ],
        initialSyncMap: { 1: true, 2: false, 3: true },
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
    it("should disable toggle when can_write is false", () => {
      setup({
        collections: [createMockCollection({ can_write: false })],
      });

      expect(screen.getByRole("switch")).toBeDisabled();
    });

    it("should enable toggle when can_write is true", () => {
      setup({
        collections: [createMockCollection({ can_write: true })],
      });

      expect(screen.getByRole("switch")).toBeEnabled();
    });

    it("should disable toggle when sync type is read-only", () => {
      setup({
        collections: [createMockCollection({ can_write: true })],
        syncType: "read-only",
      });

      expect(screen.getByRole("switch")).toBeDisabled();
    });

    it("should enable toggle when sync type is read-write and can_write is true", () => {
      setup({
        collections: [createMockCollection({ can_write: true })],
        syncType: "read-write",
      });

      expect(screen.getByRole("switch")).toBeEnabled();
    });
  });

  describe("mode switching", () => {
    it("should reset collection sync state to initial values when switching from read-write to read-only", async () => {
      const { onSubmit } = setupWithSyncTypeToggle({
        collections: [createMockCollection({ id: 1 })],
        initialSyncMap: { 1: false },
        syncType: "read-write",
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
        collections: [createMockCollection({ id: 1 })],
        initialSyncMap: { 1: true },
        syncType: "read-only",
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

  describe("dirty state tracking after reinitialization", () => {
    const SetupWithReinitialize = ({
      collections,
      initialSyncMap,
      syncType = "read-write",
    }: {
      collections: CollectionItem[];
      initialSyncMap: CollectionSyncPreferences;
      syncType?: "read-only" | "read-write";
    }) => {
      const [currentInitialValues, setCurrentInitialValues] = React.useState({
        [COLLECTIONS_KEY]: initialSyncMap,
        [TYPE_KEY]: syncType,
      });
      const [lastSubmittedValues, setLastSubmittedValues] =
        React.useState<Record<string, unknown> | null>(null);

      const handleSubmit = (values: Record<string, unknown>) => {
        setLastSubmittedValues(values);
        // Simulate server update by changing initial values to match submitted values
        setCurrentInitialValues({
          ...currentInitialValues,
          [COLLECTIONS_KEY]: values[
            COLLECTIONS_KEY
          ] as CollectionSyncPreferences,
        });
      };

      return (
        <FormProvider
          initialValues={currentInitialValues}
          onSubmit={handleSubmit}
          enableReinitialize
        >
          {({ dirty }) => (
            <Form>
              <CollectionSyncList
                collections={collections}
                isLoading={false}
                error={null}
                emptyMessage="No collections found"
              />
              <FormSubmitButton
                label="Save"
                disabled={!dirty}
                data-testid="save-button"
              />
              <div data-testid="dirty-status">{dirty ? "dirty" : "clean"}</div>
              <div data-testid="last-submitted">
                {lastSubmittedValues
                  ? JSON.stringify(lastSubmittedValues)
                  : "none"}
              </div>
            </Form>
          )}
        </FormProvider>
      );
    };

    it("should track dirty state correctly after save and toggle back", async () => {
      const collections = [createMockCollection({ id: 42 })];

      renderWithProviders(
        <SetupWithReinitialize
          collections={collections}
          initialSyncMap={{ 42: true }}
        />,
      );

      // Initial state: collection is synced (ON), form is clean
      expect(screen.getByRole("switch")).toBeChecked();
      expect(screen.getByTestId("dirty-status")).toHaveTextContent("clean");
      expect(screen.getByTestId("save-button")).toBeDisabled();

      // Toggle collection OFF
      await userEvent.click(screen.getByRole("switch"));
      expect(screen.getByRole("switch")).not.toBeChecked();
      expect(screen.getByTestId("dirty-status")).toHaveTextContent("dirty");
      expect(screen.getByTestId("save-button")).toBeEnabled();

      // Save - this triggers reinitialization with new values
      await userEvent.click(screen.getByTestId("save-button"));

      // After save, form should be clean with new initial values
      await waitFor(() => {
        expect(screen.getByTestId("dirty-status")).toHaveTextContent("clean");
      });
      expect(screen.getByRole("switch")).not.toBeChecked();
      expect(screen.getByTestId("save-button")).toBeDisabled();

      // Toggle back to ON (original value)
      await userEvent.click(screen.getByRole("switch"));

      // Form should now be dirty because current value (ON) differs from saved value (OFF)
      expect(screen.getByRole("switch")).toBeChecked();
      expect(screen.getByTestId("dirty-status")).toHaveTextContent("dirty");
      expect(screen.getByTestId("save-button")).toBeEnabled();
    });

    it("should track dirty state correctly with multiple toggles after reinitialization", async () => {
      const collections = [
        createMockCollection({ id: 1, name: "Collection A" }),
        createMockCollection({ id: 2, name: "Collection B" }),
      ];

      renderWithProviders(
        <SetupWithReinitialize
          collections={collections}
          initialSyncMap={{ 1: true, 2: false }}
        />,
      );

      const switches = screen.getAllByRole("switch");

      // Initial state
      expect(switches[0]).toBeChecked(); // Collection 1 is ON
      expect(switches[1]).not.toBeChecked(); // Collection 2 is OFF
      expect(screen.getByTestId("dirty-status")).toHaveTextContent("clean");

      // Toggle collection 1 OFF
      await userEvent.click(switches[0]);
      expect(screen.getByTestId("dirty-status")).toHaveTextContent("dirty");

      // Save
      await userEvent.click(screen.getByTestId("save-button"));

      await waitFor(() => {
        expect(screen.getByTestId("dirty-status")).toHaveTextContent("clean");
      });

      // Now toggle collection 2 ON
      await userEvent.click(switches[1]);
      expect(screen.getByTestId("dirty-status")).toHaveTextContent("dirty");
      expect(screen.getByTestId("save-button")).toBeEnabled();
    });
  });
});
