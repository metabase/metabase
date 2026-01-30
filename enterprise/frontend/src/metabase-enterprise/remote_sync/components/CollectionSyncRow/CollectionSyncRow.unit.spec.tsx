import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type { CollectionItem } from "metabase-types/api";
import { createMockCollectionItem } from "metabase-types/api/mocks";

import { CollectionSyncRow } from "./CollectionSyncRow";

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
  collection?: CollectionItem;
  isChecked?: boolean;
  isReadOnly?: boolean;
}

const setup = ({
  collection = createMockCollection(),
  isChecked = false,
  isReadOnly = false,
}: SetupOpts = {}) => {
  const onToggle = jest.fn();

  renderWithProviders(
    <CollectionSyncRow
      collection={collection}
      isChecked={isChecked}
      onToggle={onToggle}
      isReadOnly={isReadOnly}
    />,
  );

  return { onToggle };
};

describe("CollectionSyncRow", () => {
  describe("rendering", () => {
    it("should render collection name", () => {
      setup({ collection: createMockCollection({ name: "My Collection" }) });

      expect(screen.getByText("My Collection")).toBeInTheDocument();
    });

    it("should render sync label", () => {
      setup();

      expect(screen.getByText("Sync")).toBeInTheDocument();
    });

    it("should render a switch toggle", () => {
      setup();

      expect(screen.getByRole("switch")).toBeInTheDocument();
    });

    it("should have aria-label for accessibility", () => {
      setup({ collection: createMockCollection({ name: "Analytics" }) });

      expect(
        screen.getByRole("switch", { name: /sync analytics/i }),
      ).toBeInTheDocument();
    });
  });

  describe("toggle state", () => {
    it("should show unchecked when isChecked is false", () => {
      setup({ isChecked: false });

      expect(screen.getByRole("switch")).not.toBeChecked();
    });

    it("should show checked when isChecked is true", () => {
      setup({ isChecked: true });

      expect(screen.getByRole("switch")).toBeChecked();
    });
  });

  describe("toggle interaction", () => {
    it("should call onToggle with collection and true when toggling on", async () => {
      const collection = createMockCollection({ id: 42 });
      const { onToggle } = setup({ collection, isChecked: false });

      await userEvent.click(screen.getByRole("switch"));

      expect(onToggle).toHaveBeenCalledWith(collection, true);
    });

    it("should call onToggle with collection and false when toggling off", async () => {
      const collection = createMockCollection({ id: 42 });
      const { onToggle } = setup({ collection, isChecked: true });

      await userEvent.click(screen.getByRole("switch"));

      expect(onToggle).toHaveBeenCalledWith(collection, false);
    });
  });

  describe("disabled state", () => {
    it("should disable toggle when can_write is false", () => {
      setup({ collection: createMockCollection({ can_write: false }) });

      expect(screen.getByRole("switch")).toBeDisabled();
    });

    it("should enable toggle when can_write is true", () => {
      setup({ collection: createMockCollection({ can_write: true }) });

      expect(screen.getByRole("switch")).toBeEnabled();
    });

    it("should disable toggle when isReadOnly is true", () => {
      setup({
        collection: createMockCollection({ can_write: true }),
        isReadOnly: true,
      });

      expect(screen.getByRole("switch")).toBeDisabled();
    });

    it("should disable toggle when can_write is false and isReadOnly is true", () => {
      setup({
        collection: createMockCollection({ can_write: false }),
        isReadOnly: true,
      });

      expect(screen.getByRole("switch")).toBeDisabled();
    });

    it("should not call onToggle when disabled and clicked", async () => {
      const { onToggle } = setup({
        collection: createMockCollection({ can_write: false }),
      });

      await userEvent.click(screen.getByRole("switch"));

      expect(onToggle).not.toHaveBeenCalled();
    });
  });
});
