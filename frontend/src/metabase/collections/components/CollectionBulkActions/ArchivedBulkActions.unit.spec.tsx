import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { useState } from "react";

import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import type { Collection, CollectionItem } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import { ArchivedBulkActions } from "./ArchivedBulkActions";

const trashCollection = createMockCollection({ id: 1, type: "trash" });

function TestComponent({
  selected,
  collection,
  clearSelected = jest.fn(),
}: {
  selected: CollectionItem[];
  collection: Collection;
  clearSelected?: () => void;
}) {
  const [selectedItems, setSelectedItems] = useState<CollectionItem[] | null>(
    null,
  );
  const [selectedAction, setSelectedAction] = useState<string | null>(null);

  return (
    <>
      <ArchivedBulkActions
        selected={selected}
        collection={collection}
        selectedItems={selectedItems}
        selectedAction={selectedAction}
        clearSelected={clearSelected}
        setSelectedItems={setSelectedItems}
        setSelectedAction={setSelectedAction}
      />
      <UndoListing />
    </>
  );
}

const setup = (selected: CollectionItem[]) => {
  const clearSelected = jest.fn();
  renderWithProviders(
    <TestComponent
      selected={selected}
      collection={trashCollection}
      clearSelected={clearSelected}
    />,
  );
  return { clearSelected };
};

const confirmBulkDelete = async () => {
  await userEvent.click(
    screen.getByRole("button", { name: "Delete permanently" }),
  );
  const dialog = await screen.findByRole("dialog");
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Delete permanently" }),
  );
};

const archivedCollectionItems = [
  createMockCollectionItem({
    id: 10,
    model: "collection",
    name: "First",
    can_delete: true,
  }),
  createMockCollectionItem({
    id: 11,
    model: "collection",
    name: "Second",
    can_delete: true,
  }),
];

describe("ArchivedBulkActions", () => {
  it("does not clear selection when the delete confirmation is canceled (metabase#44911)", async () => {
    const { clearSelected } = setup(archivedCollectionItems);

    await userEvent.click(
      screen.getByRole("button", { name: "Delete permanently" }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(clearSelected).not.toHaveBeenCalled();
  });

  it("shows a single success message and closes the modal when all deletes succeed", async () => {
    fetchMock.delete("path:/api/collection/10", 204);
    fetchMock.delete("path:/api/collection/11", 204);

    setup(archivedCollectionItems);
    await confirmBulkDelete();

    expect(
      await screen.findByText("2 items have been permanently deleted."),
    ).toBeInTheDocument();
    // the per-item toast must not also fire for bulk deletes
    expect(
      screen.queryByText("This item has been permanently deleted."),
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(
      fetchMock.callHistory.calls(undefined, { method: "DELETE" }),
    ).toHaveLength(2);
  });

  it("shows an error message instead of success when a delete fails", async () => {
    fetchMock.delete("path:/api/collection/10", 204);
    fetchMock.delete("path:/api/collection/11", 500);

    setup(archivedCollectionItems);
    await confirmBulkDelete();

    expect(
      await screen.findByText(
        "There was an error permanently deleting these items.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("2 items have been permanently deleted."),
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
