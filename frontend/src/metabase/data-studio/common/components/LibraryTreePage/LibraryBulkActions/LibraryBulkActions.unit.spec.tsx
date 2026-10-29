import { renderWithProviders, screen } from "__support__/ui";
import type { SelectedItem } from "metabase/data-studio/common/hooks/use-library-bulk-selection";
import { createMockCollectionItem } from "metabase-types/api/mocks";

import {
  LibraryBulkActions,
  isMoveDestinationDisabled,
} from "./LibraryBulkActions";

type SetupOpts = {
  selectedItems: SelectedItem[];
};

function setup({ selectedItems }: SetupOpts) {
  renderWithProviders(
    <LibraryBulkActions
      selectedItems={selectedItems}
      selectionSection="actions"
      isAllTables={false}
      defaultCollectionId={undefined}
      onClear={jest.fn()}
    />,
  );
}

function createSelectedAction(
  opts: Pick<SelectedItem, "entityId" | "canWrite">,
): SelectedItem {
  return {
    key: `action-${opts.entityId}`,
    model: "action",
    section: "actions",
    sourceCollectionId: null,
    ...opts,
  };
}

describe("LibraryBulkActions", () => {
  it("offers moving and trashing when every selected item is writable", () => {
    setup({
      selectedItems: [
        createSelectedAction({ entityId: 1, canWrite: true }),
        createSelectedAction({ entityId: 2, canWrite: true }),
      ],
    });

    expect(screen.getByRole("button", { name: "Move" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Move to trash" }),
    ).toBeInTheDocument();
  });

  it("doesn't offer moving or trashing when a selected item isn't writable", () => {
    setup({
      selectedItems: [
        createSelectedAction({ entityId: 1, canWrite: true }),
        createSelectedAction({ entityId: 2, canWrite: false }),
      ],
    });

    expect(
      screen.queryByRole("button", { name: "Move" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Move to trash" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
  });
});

describe("isMoveDestinationDisabled", () => {
  const moving = ["5"]; // collection 5 is being moved

  it("disables the collection being moved (can't move into itself)", () => {
    expect(
      isMoveDestinationDisabled(
        createMockCollectionItem({
          id: 5,
          model: "collection",
          location: "/1/",
        }),
        moving,
      ),
    ).toBe(true);
  });

  it("disables a descendant of a collection being moved", () => {
    expect(
      isMoveDestinationDisabled(
        createMockCollectionItem({
          id: 7,
          model: "collection",
          location: "/1/5/",
        }),
        moving,
      ),
    ).toBe(true);
  });

  it("allows unrelated collections", () => {
    expect(
      isMoveDestinationDisabled(
        createMockCollectionItem({
          id: 8,
          model: "collection",
          location: "/1/",
        }),
        moving,
      ),
    ).toBe(false);
  });

  it("never disables non-collection items or when nothing is a collection", () => {
    expect(
      isMoveDestinationDisabled(
        createMockCollectionItem({ id: 9, model: "table", location: "/1/5/" }),
        moving,
      ),
    ).toBe(false);
    expect(
      isMoveDestinationDisabled(
        createMockCollectionItem({ id: 5, model: "collection" }),
        [],
      ),
    ).toBe(false);
  });
});
