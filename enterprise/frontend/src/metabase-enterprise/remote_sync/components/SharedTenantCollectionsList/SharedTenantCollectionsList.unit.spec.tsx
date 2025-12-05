import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockCollectionItem } from "metabase-types/api/mocks";

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

const setup = ({
  collections = [createMockTenantCollectionItem()],
}: {
  collections?: ReturnType<typeof createMockCollectionItem>[];
} = {}) => {
  fetchMock.get(
    "path:/api/collection/root/items",
    { data: collections },
    { name: "root-items" },
  );
  fetchMock.put(
    "glob:/api/collection/*",
    (url: string) => {
      const id = url.split("/").pop();
      return { id: Number(id) };
    },
    { name: "update-collection" },
  );

  renderWithProviders(<SharedTenantCollectionsList />);
};

describe("SharedTenantCollectionsList", () => {
  describe("rendering", () => {
    it("should show loading state while fetching", async () => {
      fetchMock.get("path:/api/collection/root/items", new Promise(() => {}), {
        name: "root-items",
      });

      renderWithProviders(<SharedTenantCollectionsList />);

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
        "path:/api/collection/root/items",
        { status: 500 },
        { name: "root-items" },
      );

      renderWithProviders(<SharedTenantCollectionsList />);

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

  describe("toggle behavior", () => {
    it("should show unchecked when is_remote_synced is false", async () => {
      setup({
        collections: [
          createMockTenantCollectionItem({ is_remote_synced: false }),
        ],
      });

      await waitFor(() => {
        expect(screen.getByRole("switch")).not.toBeChecked();
      });
    });

    it("should show checked when is_remote_synced is true", async () => {
      setup({
        collections: [
          createMockTenantCollectionItem({ is_remote_synced: true }),
        ],
      });

      await waitFor(() => {
        expect(screen.getByRole("switch")).toBeChecked();
      });
    });

    it("should call updateCollection API when toggling on", async () => {
      setup({
        collections: [
          createMockTenantCollectionItem({
            id: 42,
            is_remote_synced: false,
          }),
        ],
      });

      await waitFor(() => {
        expect(screen.getByRole("switch")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("switch"));

      await waitFor(() => {
        expect(
          fetchMock.callHistory.calls("glob:/api/collection/*", {
            method: "PUT",
          }),
        ).toHaveLength(1);
      });

      const calls = fetchMock.callHistory.calls("glob:/api/collection/*", {
        method: "PUT",
      });
      expect(calls[0].url).toContain("/api/collection/42");
    });

    it("should call updateCollection API when toggling off", async () => {
      setup({
        collections: [
          createMockTenantCollectionItem({
            id: 42,
            is_remote_synced: true,
          }),
        ],
      });

      await waitFor(() => {
        expect(screen.getByRole("switch")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("switch"));

      await waitFor(() => {
        const calls = fetchMock.callHistory.calls("glob:/api/collection/*", {
          method: "PUT",
        });
        expect(calls).toHaveLength(1);
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
  });
});
