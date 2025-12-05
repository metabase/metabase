import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithTheme } from "__support__/ui";
import { createMockCollection } from "metabase-types/api/mocks";

import { CollectionRemoteSyncToggle } from "./CollectionRemoteSyncToggle";

describe("CollectionRemoteSyncToggle", () => {
  const onUpdateCollection = jest.fn();

  beforeEach(() => {
    onUpdateCollection.mockClear();
  });

  describe("visibility", () => {
    it("should not render for non-shared-tenant-collection namespace", () => {
      const collection = createMockCollection({
        id: 1,
        name: "Regular Collection",
        namespace: undefined,
        location: "/",
        can_write: true,
      });

      renderWithTheme(
        <CollectionRemoteSyncToggle
          collection={collection}
          onUpdateCollection={onUpdateCollection}
        />,
      );

      expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    });

    it("should not render for shared-tenant-collection not at root level", () => {
      const collection = createMockCollection({
        id: 1,
        name: "Nested Tenant Collection",
        namespace: "shared-tenant-collection",
        location: "/5/",
        can_write: true,
      });

      renderWithTheme(
        <CollectionRemoteSyncToggle
          collection={collection}
          onUpdateCollection={onUpdateCollection}
        />,
      );

      expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    });

    it("should render for shared-tenant-collection at root level", () => {
      const collection = createMockCollection({
        id: 1,
        name: "Tenant Collection",
        namespace: "shared-tenant-collection",
        location: "/",
        can_write: true,
      });

      renderWithTheme(
        <CollectionRemoteSyncToggle
          collection={collection}
          onUpdateCollection={onUpdateCollection}
        />,
      );

      expect(screen.getByRole("switch")).toBeInTheDocument();
      expect(screen.getByText("Remote sync")).toBeInTheDocument();
    });
  });

  describe("toggle behavior", () => {
    it("should show unchecked when is_remote_synced is false", () => {
      const collection = createMockCollection({
        id: 1,
        name: "Tenant Collection",
        namespace: "shared-tenant-collection",
        location: "/",
        can_write: true,
        is_remote_synced: false,
      });

      renderWithTheme(
        <CollectionRemoteSyncToggle
          collection={collection}
          onUpdateCollection={onUpdateCollection}
        />,
      );

      expect(screen.getByRole("switch")).not.toBeChecked();
    });

    it("should show checked when is_remote_synced is true", () => {
      const collection = createMockCollection({
        id: 1,
        name: "Tenant Collection",
        namespace: "shared-tenant-collection",
        location: "/",
        can_write: true,
        is_remote_synced: true,
      });

      renderWithTheme(
        <CollectionRemoteSyncToggle
          collection={collection}
          onUpdateCollection={onUpdateCollection}
        />,
      );

      expect(screen.getByRole("switch")).toBeChecked();
    });

    it("should call onUpdateCollection with is_remote_synced: true when toggling on", async () => {
      const collection = createMockCollection({
        id: 1,
        name: "Tenant Collection",
        namespace: "shared-tenant-collection",
        location: "/",
        can_write: true,
        is_remote_synced: false,
      });

      renderWithTheme(
        <CollectionRemoteSyncToggle
          collection={collection}
          onUpdateCollection={onUpdateCollection}
        />,
      );

      await userEvent.click(screen.getByRole("switch"));

      expect(onUpdateCollection).toHaveBeenCalledWith(collection, {
        is_remote_synced: true,
      });
    });

    it("should call onUpdateCollection with is_remote_synced: false when toggling off", async () => {
      const collection = createMockCollection({
        id: 1,
        name: "Tenant Collection",
        namespace: "shared-tenant-collection",
        location: "/",
        can_write: true,
        is_remote_synced: true,
      });

      renderWithTheme(
        <CollectionRemoteSyncToggle
          collection={collection}
          onUpdateCollection={onUpdateCollection}
        />,
      );

      await userEvent.click(screen.getByRole("switch"));

      expect(onUpdateCollection).toHaveBeenCalledWith(collection, {
        is_remote_synced: false,
      });
    });
  });

  describe("permissions", () => {
    it("should be disabled when can_write is false", () => {
      const collection = createMockCollection({
        id: 1,
        name: "Tenant Collection",
        namespace: "shared-tenant-collection",
        location: "/",
        can_write: false,
        is_remote_synced: false,
      });

      renderWithTheme(
        <CollectionRemoteSyncToggle
          collection={collection}
          onUpdateCollection={onUpdateCollection}
        />,
      );

      expect(screen.getByRole("switch")).toBeDisabled();
    });

    it("should be enabled when can_write is true", () => {
      const collection = createMockCollection({
        id: 1,
        name: "Tenant Collection",
        namespace: "shared-tenant-collection",
        location: "/",
        can_write: true,
        is_remote_synced: false,
      });

      renderWithTheme(
        <CollectionRemoteSyncToggle
          collection={collection}
          onUpdateCollection={onUpdateCollection}
        />,
      );

      expect(screen.getByRole("switch")).toBeEnabled();
    });
  });
});
