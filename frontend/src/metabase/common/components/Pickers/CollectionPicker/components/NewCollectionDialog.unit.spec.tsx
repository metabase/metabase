import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen } from "__support__/ui";
import type { CollectionId } from "metabase-types/api";

import { NewCollectionDialog } from "./NewCollectionDialog";

const setup = (
  params: {
    parentCollectionId: CollectionId | null;
  } = {
    parentCollectionId: "root",
  },
) => {
  const onClose = jest.fn();
  const onNewCollection = jest.fn();
  fetchMock.post("path:/api/collection", { id: 2 });
  renderWithProviders(
    <NewCollectionDialog
      isOpen
      onClose={onClose}
      onNewCollection={onNewCollection}
      {...params}
    />,
  );
};

describe("new collection dialog", () => {
  it("should handle a parentCollectionId of root", async () => {
    setup({
      parentCollectionId: "root",
    });
    await userEvent.type(
      screen.getByPlaceholderText("My new collection"),
      "Test collection",
    );
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    const apiCalls = fetchMock.callHistory.calls("path:/api/collection");
    expect(apiCalls).toHaveLength(1);

    const call = apiCalls[0];
    const body = JSON.parse(call.options?.body as string);
    expect(body.parent_id).toBe(null);
  });

  it("should handle a normal parentCollectionId", async () => {
    setup({ parentCollectionId: 12 });
    await userEvent.type(
      screen.getByPlaceholderText("My new collection"),
      "Test collection",
    );
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    const apiCalls = fetchMock.callHistory.calls("path:/api/collection");
    expect(apiCalls).toHaveLength(1);

    const call = apiCalls[0];
    const body = JSON.parse(call.options?.body as string);
    expect(body.parent_id).toBe(12);
  });

  it("should handle a parentCollectionId of null", async () => {
    setup({ parentCollectionId: null });
    await userEvent.type(
      screen.getByPlaceholderText("My new collection"),
      "Test collection",
    );
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    const apiCalls = fetchMock.callHistory.calls("path:/api/collection");
    expect(apiCalls).toHaveLength(1);

    const call = apiCalls[0];
    const body = JSON.parse(call.options?.body as string);
    expect(body.parent_id).toBe(null);
  });

  it("should show validation error when name exceeds 100 characters", async () => {
    setup({ parentCollectionId: "root" });
    const longName = "a".repeat(101);
    const input = screen.getByPlaceholderText("My new collection");
    await userEvent.type(input, longName);
    await userEvent.tab();

    expect(
      await screen.findByText(/must be 100 characters or less/),
    ).toBeInTheDocument();

    const createButton = screen.getByRole("button", { name: "Create" });
    expect(createButton).toBeDisabled();

    const apiCalls = fetchMock.callHistory.calls("path:/api/collection");
    expect(apiCalls).toHaveLength(0);
  });
});
