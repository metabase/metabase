import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen } from "__support__/ui";
import type { CollectionId } from "metabase-types/api";

import { NewDashboardDialog } from "./NewDashboardDialog";

const setup = (
  params: {
    parentCollectionId: CollectionId | null;
  } = {
    parentCollectionId: "root",
  },
) => {
  const onClose = jest.fn();
  const onNewCollection = jest.fn();
  fetchMock.post("path:/api/dashboard", { id: 2 });
  renderWithProviders(
    <NewDashboardDialog
      isOpen
      onClose={onClose}
      onNewDashboard={onNewCollection}
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
      screen.getByPlaceholderText("My new dashboard"),
      "Test collection",
    );
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    const apiCalls = fetchMock.calls("path:/api/dashboard");
    expect(apiCalls).toHaveLength(1);

    const [_, options] = apiCalls[0];
    const body = JSON.parse((await options?.body) as string);
    expect(body.collection_id).toBe(null);
  });

  it("should handle a normal parentCollectionId", async () => {
    setup({ parentCollectionId: 12 });
    await userEvent.type(
      screen.getByPlaceholderText("My new dashboard"),
      "Test collection",
    );
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    const apiCalls = fetchMock.calls("path:/api/dashboard");
    expect(apiCalls).toHaveLength(1);

    const [_, options] = apiCalls[0];
    const body = JSON.parse((await options?.body) as string);
    expect(body.collection_id).toBe(12);
  });

  it("should handle a parentCollectionId of null", async () => {
    setup({ parentCollectionId: null });
    await userEvent.type(
      screen.getByPlaceholderText("My new dashboard"),
      "Test collection",
    );
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    const apiCalls = fetchMock.calls("path:/api/dashboard");
    expect(apiCalls).toHaveLength(1);

    const [_, options] = apiCalls[0];
    const body = JSON.parse((await options?.body) as string);
    expect(body.collection_id).toBe(null);
  });
});
