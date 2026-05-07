import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("CreateCollectionForm", () => {
  it("displays correct blank state", () => {
    setup();

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("");

    expect(screen.getByLabelText("Description")).toBeInTheDocument();
    expect(screen.getByLabelText("Description")).toHaveValue("");

    expect(screen.getByText(/Collection it's saved in/i)).toBeInTheDocument();
    expect(screen.getByText("Our analytics")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });

  it("uses the explicit initial collection id", async () => {
    setup({ initialCollectionId: 2 });

    expect(await screen.findByText("Data")).toBeInTheDocument();
    expect(screen.queryByText("Our analytics")).not.toBeInTheDocument();
  });

  it("can't submit if name is empty", () => {
    setup();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("calls onCancel when cancel button is clicked", async () => {
    const { onCancel } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not show authority level controls", () => {
    setup();
    expect(screen.queryByLabelText("Collection type")).not.toBeInTheDocument();
  });

  it("submits the namespace from the initial parent collection", async () => {
    const { onSubmit } = setup({
      initialCollectionId: 2,
      parentCollectionNamespace: "snippets",
      namespaces: ["snippets"],
    });

    await userEvent.type(screen.getByLabelText("Name"), "My snippets folder");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: "snippets" }),
    );
  });
});
