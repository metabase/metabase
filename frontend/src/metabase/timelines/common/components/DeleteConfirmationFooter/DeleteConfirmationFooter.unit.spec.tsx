import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

import { DeleteConfirmationFooter } from "./DeleteConfirmationFooter";

describe("DeleteConfirmationFooter", () => {
  it("should delete or cancel", async () => {
    const onDelete = jest.fn();
    const onCancel = jest.fn();

    render(
      <DeleteConfirmationFooter onDelete={onDelete} onCancel={onCancel} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
