import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("CreateCollectionForm", () => {
  it("displays correct blank state", async () => {
    setup();

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("");

    expect(screen.getByLabelText("Description")).toBeInTheDocument();
    expect(screen.getByLabelText("Description")).toHaveValue("");

    expect(screen.getByText(/Collection it's saved in/i)).toBeInTheDocument();
    expect(await screen.findByText("Our analytics")).toBeInTheDocument();

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

  it("submits worktree_id for a root-level collection scoped to a worktree", async () => {
    const { onSubmit } = setup({ worktreeId: 42 });

    await userEvent.type(screen.getByLabelText("Name"), "Worktree folder");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ parent_id: null, worktree_id: 42 }),
    );
  });

  it("submits without worktree_id when not scoped to a worktree", async () => {
    const { onSubmit } = setup();

    await userEvent.type(screen.getByLabelText("Name"), "Plain folder");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("worktree_id");
  });
});
