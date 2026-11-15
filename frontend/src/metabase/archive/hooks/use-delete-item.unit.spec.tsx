import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";

import { type DeletableItem, useDeleteItem } from "./use-delete-item";

function TestComponent({ item }: { item: DeletableItem }) {
  const deleteItem = useDeleteItem();
  return (
    <div>
      <button onClick={() => deleteItem(item)}>Delete</button>
      <UndoListing />
    </div>
  );
}

const setup = (item: DeletableItem) => {
  renderWithProviders(<TestComponent item={item} />);
};

const clickDelete = async () => {
  await userEvent.click(screen.getByRole("button", { name: "Delete" }));
};

const expectSingleDeleteCall = async (path: string) => {
  await waitFor(() => {
    expect(
      fetchMock.callHistory.calls(path, { method: "DELETE" }),
    ).toHaveLength(1);
  });
};

describe("useDeleteItem", () => {
  it.each(["card", "dataset", "metric"] as const)(
    "deletes a %s via DELETE /api/card/:id",
    async (model) => {
      fetchMock.delete("path:/api/card/1", 204);

      setup({ model, id: 1, can_delete: true });
      await clickDelete();

      await expectSingleDeleteCall("path:/api/card/1");
      expect(
        await screen.findByText("This item has been permanently deleted."),
      ).toBeInTheDocument();
    },
  );

  it("deletes a dashboard via DELETE /api/dashboard/:id", async () => {
    fetchMock.delete("path:/api/dashboard/2", 204);

    setup({ model: "dashboard", id: 2, can_delete: true });
    await clickDelete();

    await expectSingleDeleteCall("path:/api/dashboard/2");
    expect(
      await screen.findByText("This item has been permanently deleted."),
    ).toBeInTheDocument();
  });

  it("deletes a collection via DELETE /api/collection/:id", async () => {
    fetchMock.delete("path:/api/collection/3", 204);

    setup({ model: "collection", id: 3, can_delete: true });
    await clickDelete();

    await expectSingleDeleteCall("path:/api/collection/3");
    expect(
      await screen.findByText("This item has been permanently deleted."),
    ).toBeInTheDocument();
  });

  it("deletes a document via DELETE /api/document/:id", async () => {
    fetchMock.delete("path:/api/document/4", 204);

    setup({ model: "document", id: 4, can_delete: true });
    await clickDelete();

    await expectSingleDeleteCall("path:/api/document/4");
    expect(
      await screen.findByText("This item has been permanently deleted."),
    ).toBeInTheDocument();
  });
});
