import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, waitFor } from "__support__/ui";
import { createMockCollection } from "metabase-types/api/mocks";

import type { EntityPickerModalProps } from "../EntityPickerModal";

import { setup as baseSetup } from "./setup";

type SetupOpts = Partial<EntityPickerModalProps> & {
  click?: boolean;
};

async function setup({ click = true, ...props }: SetupOpts = {}) {
  await baseSetup({
    models: ["dashboard", "collection"],
    value: { id: 33, model: "collection" },
    ...props,
    options: {
      canCreateCollections: true,
      ...props.options,
    },
  });

  fetchMock.post("path:/api/collection", () => {
    return createMockCollection();
  });

  if (click) {
    const button = await screen.findByRole("button", {
      name: /new collection/i,
    });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
  }
}

describe("NewCollectionDialog", () => {
  it("should render", async () => {
    await setup();
    expect(
      await screen.findByText("Create a new collection"),
    ).toBeInTheDocument();
  });

  it("should not render the New collection button if canCreateCollections is false", async () => {
    await setup({ click: false, options: { canCreateCollections: false } });
    //wait for the initial render
    expect(await screen.findByText("Our analytics")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /new collection/i }),
    ).not.toBeInTheDocument();
  });

  it("should disable the New collection button if the user is in recents", async () => {
    await setup({
      click: false,
      value: { id: "recents", model: "collection" },
    });
    expect(
      await screen.findByRole("button", { name: /new collection/i }),
    ).toBeDisabled();
  });

  it("should disable the New collection button if the user is in search", async () => {
    await setup({
      click: false,
    });
    await userEvent.type(await screen.findByPlaceholderText("Search…"), "My", {
      delay: 50,
    });
    const button = await screen.findByRole("button", {
      name: /new collection/i,
    });
    await waitFor(() => expect(button).toBeDisabled());
  });

  it("should disable the New collection button if the user does not have write permissions to the collection", async () => {
    await setup({
      click: false,
      value: { id: 22, model: "collection" },
    });
    const button = await screen.findByRole("button", {
      name: /new collection/i,
    });
    await waitFor(() => expect(button).toBeDisabled());
  });

  it("should create a new collection", async () => {
    await setup();
    const button = await screen.findByRole("button", { name: "Create" });
    expect(button).toBeDisabled(); //can't create a collection without a name
    await userEvent.type(
      await screen.findByPlaceholderText("My new collection"),
      "My New Collection",
    );
    expect(button).toBeEnabled();
    await userEvent.click(button);

    const apiCalls = fetchMock.callHistory.calls("path:/api/collection");
    expect(apiCalls).toHaveLength(1);
    const call = apiCalls[0];
    const body = JSON.parse(call.options?.body as string);
    expect(body.name).toBe("My New Collection");
    expect(body.parent_id).toBe(33);
  });

  it("should handle a parent collection id of root", async () => {
    await setup({ value: { id: "root", model: "collection" } });
    const button = await screen.findByRole("button", { name: "Create" });
    expect(button).toBeDisabled(); //can't create a collection without a name
    await userEvent.type(
      await screen.findByPlaceholderText("My new collection"),
      "My New Collection",
    );
    expect(button).toBeEnabled();
    await userEvent.click(button);

    const apiCalls = fetchMock.callHistory.calls("path:/api/collection");
    expect(apiCalls).toHaveLength(1);
    const call = apiCalls[0];
    const body = JSON.parse(call.options?.body as string);
    expect(body.name).toBe("My New Collection");
    expect(body.parent_id).toBe(null);
  });
});
